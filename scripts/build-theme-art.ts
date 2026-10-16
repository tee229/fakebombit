import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Original vector artwork: a small, inspectable atlas for each built-in theme.
const directory = resolve('public/themes');
mkdirSync(directory, { recursive: true });
const rect = (x: number, y: number, width: number, height: number, fill: string, radius = 0, stroke = 'none', line = 2) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${line}"/>`;
const circle = (x: number, y: number, radius: number, fill: string, stroke = 'none', line = 2) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${line}"/>`;
const path = (d: string, fill: string, stroke = 'none', width = 2) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (width: number, height: number, content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Fake Bomb It original built-in theme artwork</title>${content}</svg>\n`;

for (const kind of ['candy', 'factory'] as const) {
  const candy = kind === 'candy';
  const ink = candy ? '#6d3d4b' : '#254852';
  const frames: string[] = [];
  frames.push(candy
    ? rect(0, 0, 64, 64, '#fff0d7') + path('M0 63H64M63 0V64', 'none', '#dfc5a4', 2) + path('M6 7h12M7 11h4M49 53h8', 'none', '#f2dbb9', 2)
    : rect(0, 0, 64, 64, '#b6cbc5') + rect(3, 3, 58, 58, '#c7d6cc', 3, '#91aaa5', 2) + path('M8 55h48M8 9h48', 'none', '#dce4d6', 2));
  frames.push(candy
    ? rect(5, 11, 54, 48, '#b66c83', 10) + rect(5, 5, 54, 46, '#e99eb3', 10, ink, 3) + rect(9, 8, 46, 13, '#ffe3e7', 7)
      + path('M12 30l11 11M29 28l13 13M46 29l7 7', 'none', '#fff1eb', 7) + circle(15, 13, 2, '#e781a0') + circle(43, 14, 2, '#e781a0')
    : rect(5, 12, 54, 47, '#35616f', 7) + rect(5, 6, 54, 46, '#5b97a0', 7, ink, 3) + path('M11 12h42M11 46h42', 'none', '#9ecbc2', 3)
      + [20, 44].flatMap(x => [21, 37].map(y => circle(x, y, 6, '#356a78', '#9ecbc2', 2))).join(''));
  frames.push(candy
    ? rect(6, 11, 52, 48, '#b76d42', 5) + rect(6, 6, 52, 47, '#e5b678', 5, ink, 3) + path('M10 18h44M10 30h44M10 42h44M20 10v39M32 10v39M44 10v39', 'none', '#bf854f', 3)
      + path('M12 12h40M12 16h40', 'none', '#ffe0a0', 2) + rect(26, 7, 12, 46, '#f7d9c3', 0) + path('M29 9l6 6M29 23l6 6M29 37l6 6', 'none', '#df89a3', 3)
    : rect(6, 10, 52, 49, '#8e603e', 4) + rect(6, 5, 52, 48, '#ce9c68', 4, ink, 3) + path('M9 18h46M9 43h46M20 8v42M44 8v42', 'none', '#e5c394', 4)
      + path('M14 24l13 13M27 24L14 37M38 25h9v12h-9z', 'none', '#815e43', 3) + rect(29, 7, 6, 46, '#e9d7a6'));
  for (let index = 0; index < 4; index++) {
    frames.push(`<g transform="translate(0 ${index % 2})">` + circle(32, 54, 20, '#21333433') + circle(31, 36, 20, candy ? '#54364a' : '#354954', ink, 3)
      + path('M18 29q3-10 13-10', 'none', candy ? '#b78d9e' : '#a1b9b5', 4) + path('M39 19q-2-9 8-10', 'none', '#b38844', 4)
      + (candy ? path('M17 40q13 9 29-2', 'none', '#e9a5b8', 5) : rect(14, 36, 34, 7, '#d5af62', 3))
      + path(`M47 3v${5 + index}M42 7l${4 - index} 2M51 7l3 -2`, 'none', index % 2 ? '#ffe0a1' : '#ed8055', 3) + '</g>');
  }
  for (let index = 0; index < 4; index++) {
    const peak = 4 + index * 2;
    frames.push(rect(2, 2, 60, 60, candy ? '#e5753ab3' : '#e17836b3', 7, '#ffb66f', 2)
      + path(`M32 ${peak}C45 18 39 21 48 24C60 33 52 54 33 57C9 55 9 39 17 30C23 40 25 22 32 ${peak}Z`, candy ? '#ffc170' : '#ffb75e', '#c65b39', 2)
      + path(`M32 ${24 - index}C40 34 45 46 33 50C21 48 25 38 32 ${24 - index}Z`, '#fff2bc')
      + path('M10 32h8M46 32h8M32 8v8M32 49v7', 'none', '#fff0be', 3));
  }
  for (const [color, glyph] of [
    ['#f2ca69', circle(25, 32, 7, ink) + circle(40, 32, 7, ink) + path('M27 21l4-4M42 21l4-4', 'none', ink, 2)],
    ['#f39a7c', path('M15 32h34M32 15v34M15 32l7-7M15 32l7 7M49 32l-7-7M49 32l-7 7M32 15l-7 7M32 15l7 7M32 49l-7-7M32 49l7-7', 'none', ink, 3)],
    ['#83c5ad', path('M18 21l10 11-10 11M33 21l10 11-10 11', 'none', ink, 4)],
  ]) frames.push((candy ? path('M9 23L3 17v30l6-6M55 23l6-6v30l-6-6', '#dba7b5', ink, 2) : '')
    + rect(10, 11, 44, 44, candy ? '#d6a37c' : '#6c8b8a', candy ? 13 : 8) + rect(10, 7, 44, 44, color!, candy ? 13 : 8, ink, 3) + glyph);
  for (const player of [true, false]) {
    const color = player ? (candy ? '#76c7b1' : '#72b7d0') : (candy ? '#ed9d86' : '#e4bc69');
    frames.push(circle(32, 56, 20, '#31454a35') + rect(18, 48, 10, 10, ink, 3) + rect(36, 48, 10, 10, ink, 3)
      + rect(11, 17, 42, 35, color, 11, ink, 3) + rect(16, 19, 32, 19, candy ? '#fff6dd' : '#dce9db', 7, ink, 2)
      + circle(25, 28, 3, ink) + circle(39, 28, 3, ink) + path('M27 44h10M32 16V8', 'none', ink, 3)
      + (candy ? circle(32, 7, 5, player ? '#f7c4d2' : '#fff1ad', ink, 2) : rect(27, 3, 10, 8, '#e0bd73', 3, ink, 2)));
  }
  frames.push(circle(32, 32, 17, 'none', candy ? '#c99fa5' : '#6b9390', 2) + path('M24 32h16M32 24v16', 'none', candy ? '#c99fa5' : '#6b9390', 2));
  const atlas = frames.map((frame, index) => `<g transform="translate(${index % 8 * 64} ${Math.floor(index / 8) * 64})">${frame}</g>`).join('');
  writeFileSync(resolve(directory, `${kind}-atlas.svg`), svg(512, 192, atlas));
  const accent = candy ? path('M31 55V20', 'none', '#e4d6bc', 6) + circle(31, 20, 17, '#efa2bc', ink, 3) + path('M25 9C8 22 37 41 43 20C44 7 22 6 23 21C24 29 35 31 37 21', 'none', '#fff0df', 4)
    : rect(16, 38, 36, 17, '#d59c67', 4, ink, 3) + path('M20 37l7-20h17l5 20z', '#709e9f', ink, 3) + circle(25, 55, 5, ink) + circle(45, 55, 5, ink) + path('M32 17V7M28 7h8', 'none', '#e0bb72', 4);
  writeFileSync(resolve(directory, `${kind}-accent.svg`), svg(64, 64, accent));
  const arrangement = [[1, 1, 1, 1, 1], [1, 14, 2, 11, 1], [1, 0, 3, 15, 1]];
  const preview = arrangement.map((row, y) => row.map((frame, x) => `<g transform="translate(${x * 64} ${y * 64})">${frames[0]}${frame === 0 ? '' : frames[frame]}</g>`).join('')).join('');
  writeFileSync(resolve(directory, `${kind}-preview.svg`), svg(320, 192, preview));
}
