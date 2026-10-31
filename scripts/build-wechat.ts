import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/wechat');
// Only the generated target owned by this script may be replaced.
if (output !== join(root, 'dist', 'wechat') || !output.startsWith(root + sep)) throw new Error('Unsafe build output');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const manifest: { source: string; output: string; sourceSha256: string; outputSha256: string }[] = [];
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
function media(source: string, destination: string, kind: 'svg' | 'background' | 'wordmark' | 'music' | 'copy'): void {
  const input = join(root, 'public', source), target = join(output, destination);
  mkdirSync(dirname(target), { recursive: true });
  if (kind === 'svg') writeFileSync(target, new Resvg(readFileSync(input), { font: { loadSystemFonts: false },
    ...(source.endsWith('-preview.svg') ? { fitTo: { mode: 'width' as const, value: source.startsWith('skins/') ? 512 : 640 } } : {}),
  }).render().asPng());
  else if (kind === 'copy') writeFileSync(target, readFileSync(input));
  else {
    const encoding = kind === 'music' ? ['-vn', '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1']
      : kind === 'background' ? ['-vf', 'scale=1280:-2', '-frames:v', '1', '-q:v', '3']
      : ['-vf', 'scale=768:-1', '-frames:v', '1'];
    try { execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...encoding, target], { windowsHide: true }); }
    catch (error) { throw new Error(`FFmpeg failed for ${source}. Install FFmpeg or set FFMPEG_PATH.`, { cause: error }); }
  }
  manifest.push({ source: `public/${source}`, output: destination, sourceSha256: hash(readFileSync(input)), outputSha256: hash(readFileSync(target)) });
}
for (const directory of ['themes', 'skins']) for (const name of readdirSync(join(root, 'public', directory))) {
  if (name.endsWith('.svg')) media(`${directory}/${name}`, `${directory}/${name.replace(/\.svg$/, '.png')}`, 'svg');
}
for (const mode of ['light', 'dark']) media(`ui/menu-${mode}.png`, `ui/menu-${mode}.jpg`, 'background');
media('ui/wordmark.png', 'ui/wordmark.png', 'wordmark');
media('audio/fbi-bgm.mp3', 'audio/fbi-bgm.mp3', 'music');
for (const name of readdirSync(join(root, 'public/audio'))) if (name.endsWith('.wav')) media(`audio/${name}`, `audio/${name}`, 'copy');
// Rasterize the existing Phosphor family in both UI palettes, rather than using font glyphs as icons.
const icons = { pause: 'bold/pause-bold', play: 'fill/play-fill', settings: 'bold/gear-six-bold', sun: 'bold/sun-bold',
  moon: 'fill/moon-fill', layers: 'bold/stack-bold', close: 'bold/x-bold', bomb: 'fill/bomb-fill',
  up: 'bold/caret-up-bold', down: 'bold/caret-down-bold', left: 'bold/caret-left-bold', right: 'bold/caret-right-bold',
  retry: 'bold/arrow-counter-clockwise-bold', home: 'bold/house-bold' };
for (const [name, file] of Object.entries(icons)) for (const [mode, color] of [['dark', '#f3fbf7'], ['light', '#103d4a']]) {
  const source = join(root, 'node_modules/@phosphor-icons/core/assets', `${file}.svg`);
  const svg = readFileSync(source, 'utf8').replaceAll('currentColor', color!);
  const target = `icons/${name}-${mode}.png`;
  mkdirSync(join(output, 'icons'), { recursive: true });
  writeFileSync(join(output, target), new Resvg(svg, { fitTo: { mode: 'width', value: 64 } }).render().asPng());
  manifest.push({ source: relative(root, source).replaceAll('\\', '/'), output: target,
    sourceSha256: hash(readFileSync(source)), outputSha256: hash(readFileSync(join(output, target))) });
}
await build({ configFile: false, publicDir: false, logLevel: 'warn',
  // The device-preview packager rejects optional chaining/nullish operators that its simulator accepts.
  build: { outDir: output, emptyOutDir: false, target: 'es2019', minify: true,
    lib: { entry: join(root, 'src/wechat/main.ts'), formats: ['cjs'], fileName: () => 'game.js' },
  },
});
writeFileSync(join(output, 'game.json'), JSON.stringify({ deviceOrientation: 'landscape', showStatusBar: false }, null, 2) + '\n');
mkdirSync(join(output, 'licenses'), { recursive: true });
writeFileSync(join(output, 'licenses/phosphor-icons.txt'), readFileSync(join(root, 'node_modules/@phosphor-icons/core/LICENSE')));
writeFileSync(join(output, 'asset-manifest.json'), JSON.stringify({ format: 'fakebombit-wechat-assets-v1', assets: manifest }, null, 2) + '\n');
function bytes(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce((sum, file) => sum + (file.isDirectory() ? bytes(join(directory, file.name)) : readFileSync(join(directory, file.name)).length), 0);
}
const size = bytes(output);
// Conservative all-in-one budget; the complete music track remains bundled for offline playback.
if (size > 4 * 1024 * 1024) throw new Error(`WeChat package exceeds the 4 MiB build budget: ${size} bytes`);
console.log(`WeChat build: ${manifest.length} assets, ${(size / 1024 / 1024).toFixed(2)} MiB; import ${root}`);
