import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

// A conservative boundary: core code may import only checked local TypeScript.
const root = realpathSync(resolve(process.argv[2] ?? 'src/match'));
const forbidden = new Set([
  'Date', 'Intl', 'performance', 'window', 'document', 'navigator', 'location', 'globalThis',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'queueMicrotask',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'Image', 'Audio', 'crypto',
  'process', 'require', 'Buffer', 'Deno', 'Bun', 'console', 'eval', 'Function', 'WebAssembly',
]);
const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Symbolic-link dependency is forbidden: ${join(directory, entry.name)}`);
    return entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [];
  });
}
function inside(path: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(pathFromRoot);
}
let violations = 0;
const sources = files(root);
if (!sources.length) throw new Error('Match dependency check requires TypeScript source files');
for (const file of sources) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2023, true);
  function report(node: ts.Node, message: string): void {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
    console.error(`${file}:${line + 1}:${character + 1}: ${message}`);
    violations += 1;
  }
  function dependency(node: ts.Node, specifier: ts.Expression): void {
    if (!ts.isStringLiteralLike(specifier) || !specifier.text.startsWith('.')) {
      report(node, 'External or computed dependency is forbidden');
      return;
    }
    const resolution = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule;
    if (!resolution || !resolution.resolvedFileName.endsWith('.ts') || !inside(realpathSync(resolution.resolvedFileName))) {
      report(node, 'Unresolved, unchecked, or outside-core dependency is forbidden');
    }
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) dependency(node, node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) dependency(node, node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node)) report(node, 'CommonJS dependency is forbidden');
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments[0]) dependency(node, node.arguments[0]);
      else report(node, 'Malformed dynamic dependency is forbidden');
    }
    if (ts.isIdentifier(node) && forbidden.has(node.text)) report(node, `Environment access ${node.text} is forbidden`);
    if (ts.isMetaProperty(node)) report(node, 'Runtime module metadata is forbidden');
    if (ts.isIdentifier(node) && node.text === 'Math') {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        if (parent.name.text === 'random') report(parent, 'Uncontrolled random is forbidden');
      } else if (ts.isElementAccessExpression(parent) && parent.expression === node && ts.isStringLiteralLike(parent.argumentExpression)) {
        if (parent.argumentExpression.text === 'random') report(parent, 'Uncontrolled random is forbidden');
      } else report(node, 'Math aliasing or computed access can hide uncontrolled random and is forbidden');
    }
    if (ts.isStringLiteralLike(node) && /\.(?:png|jpe?g|gif|webp|avif|svg|mp3|wav|ogg|mp4|webm)(?:[?#].*)?$/i.test(node.text)) {
      report(node, 'Visual or audio resource references are forbidden');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (violations) process.exitCode = 1;
else console.log(`Match architecture check passed (${sources.length} source files)`);
