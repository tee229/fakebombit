import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const roots: string[] = [];
const prefix = join(tmpdir(), 'fakebombit-architecture-');
const cli = fileURLToPath(import.meta.resolve('tsx/cli'));
const checker = fileURLToPath(new URL('../scripts/check-architecture.ts', import.meta.url));
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(prefix))) throw new Error('Unexpected fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});
function check(source: string, dependencies: Record<string, string> = {}) {
  const base = mkdtempSync(prefix);
  roots.push(base);
  const root = join(base, 'core');
  mkdirSync(root);
  writeFileSync(join(root, 'index.ts'), source);
  for (const [name, content] of Object.entries(dependencies)) {
    const target = resolve(root, name);
    if (!target.startsWith(`${resolve(base)}${sep}`)) throw new Error('Unexpected fixture dependency path');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return spawnSync(process.execPath, [cli, checker, root], { encoding: 'utf8', timeout: 10_000 });
}

test('architecture CLI rejects uncontrolled randomness in the match module', () => {
  const result = check('export const roll = Math.random();');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('random');
});

test.each([
  ['clock', 'export const time = Date.now();'],
  ['clock alias', 'const clock = Date; export const time = new clock();'],
  ['browser', 'export const width = window.innerWidth;'],
  ['node', "import { readFileSync } from 'node:fs'; export { readFileSync };"],
  ['engine', "import Phaser from 'phaser'; export { Phaser };"],
  ['outside dependency', "export { other } from '../outside.js';"],
  ['asset', "export const sprite = 'images/actor.png';"],
  ['dynamic dependency', "export const load = () => import('phaser');"],
  ['computed random', "export const roll = Math['random']();"],
  ['random alias', 'const math = Math; export const roll = math.random();'],
  ['destructured random', 'const { random } = Math; export const roll = random();'],
  ['global alias', 'const host = globalThis; export const time = host.performance.now();'],
  ['dynamic code', "export const time = new Function('return Date.now()')();"],
])('architecture CLI rejects %s dependencies and forbidden environment access', (_name, source) => {
  const result = check(source);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/forbidden|dependency|resource/);
});

test('architecture CLI allows deterministic math and ignores examples in comments', () => {
  const result = check('// Date.now(); Math.random(); window\nexport const clamp = (x: number) => Math.max(0, x);');
  expect(result.status).toBe(0);
});

test('architecture CLI rejects implicit system time through Intl formatting', () => {
  const result = check('export const time = new Intl.DateTimeFormat().format();');
  expect(result.status).toBe(1);
});


test('architecture CLI accepts a checked local TypeScript dependency', () => {
  const result = check("export { limit } from './helper.js';", { 'helper.ts': 'export const limit = 3;' });
  expect(result.status).toBe(0);
});

test('architecture CLI rejects a resolvable dependency outside the core boundary', () => {
  const result = check("export { limit } from '../outside.js';", { '../outside.ts': 'export const limit = 3;' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('outside-core dependency');
});
