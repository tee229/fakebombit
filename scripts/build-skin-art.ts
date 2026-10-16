import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Original vector animation frames, kept in source so silhouettes and poses remain editable.
const directory = resolve('public/skins');
mkdirSync(directory, { recursive: true });
const ink = '#293e43';
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, stroke = ink) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const line = (d: string, color: string, width = 2.5) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (w: number, h: number, content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>Fake Bomb It original character animation frames</title>${content}</svg>\n`;

for (const id of ['mint', 'coral'] as const) {
  const rabbit = id === 'mint', color = rabbit ? '#8dd6b6' : '#ed927c', dark = rabbit ? '#4d998a' : '#b85e5b';
  const frames: string[] = [];
  for (const facing of ['down', 'right', 'up'] as const) for (let frame = 0; frame < 16; frame++) {
    const walking = frame >= 4 && frame < 10, dying = frame >= 10;
    const phase = dying ? frame - 10 : walking ? frame - 4 : frame;
    const bounce = dying ? [0, -3, 1, 4, 7, 9][phase]! : walking ? [0, -2, -3, 0, -2, -3][phase]! : [0, -1, -2, -1][phase]!;
    const step = walking ? [0, 3, 0, 0, -3, 0][phase]! : 0;
    const side = facing === 'right', back = facing === 'up';
    const opacity = dying ? [1, 1, 0.9, 0.7, 0.4, 0.12][phase]! : 1;
    const tilt = dying ? [0, -12, 10, -8, 4, 0][phase]! : 0;
    const squash = dying ? [1, 1.08, 0.9, 0.75, 0.5, 0.2][phase]! : 1;
    const boots = rect(side ? 24 : 18, 46 + step, side ? 20 : 11, 8, ink, 3)
      + (side ? '' : rect(36, 46 - step, 11, 8, ink, 3));
    const arms = line(side ? `M23 34l-3 ${10 + step}M42 34l6 ${8 - step}` : `M17 32l-5 ${11 + step}M47 32l5 ${11 - step}`, dark, rabbit ? 5 : 7);
    let body = '';
    if (rabbit) {
      body = rect(side ? 23 : 18, 27, side ? 22 : 28, 23, color, 10)
        + (back ? ellipse(32, 42, 5, 5, '#fff2d7') : ellipse(side ? 39 : 32, 39, side ? 5 : 9, 8, '#e8f5d9'))
        + rect(side ? 26 : 19, 4, 9, 22, color, 5) + rect(side ? 34 : 36, side ? 8 : 3, 9, 22, color, 5)
        + line(side ? 'M30 9v8M38 13v7' : 'M23 9v9M40 8v10', '#ecc4ba', 3)
        + rect(side ? 19 : 14, 17, side ? 30 : 36, 22, color, 11);
      if (!back) body += ellipse(side ? 42 : 26, 27, 2.4, 3, ink) + (side ? '' : ellipse(38, 27, 2.4, 3, ink))
        + ellipse(side ? 47 : 32, 32, 2.5, 1.8, '#bb7778') + line(side ? 'M42 35h3' : 'M28 35q4 3 8 0', ink, 1.8);
      else body += line('M23 27q9 5 18 0', dark, 2);
    } else {
      body = rect(side ? 21 : 16, 29, side ? 26 : 32, 22, dark, 6)
        + rect(side ? 21 : 13, 13, side ? 31 : 38, 27, color, 7)
        + rect(side ? 19 : 8, 22, 6, 12, '#d7b970', 2) + (side ? '' : rect(50, 22, 6, 12, '#d7b970', 2));
      if (back) body += rect(23, 20, 18, 15, '#cd7466', 3) + line('M27 24h10M27 29h10M26 44h12', '#ffe0be', 2);
      else body += rect(side ? 35 : 18, 19, side ? 17 : 28, 14, '#e4edda', 4)
        + line(side ? 'M44 24v4' : 'M25 24v4M39 24v4', ink, 3)
        + rect(side ? 35 : 25, 42, 13, 5, '#f0cc79', 2);
    }
    const deathMarks = dying ? line(`M${10 - phase} 20l-3 -4M${54 + phase} 20l3 -4M29 ${9 - phase}h6`, '#ffe3a3', 3) : '';
    frames.push(ellipse(32, 54, dying ? 16 - phase * 2 : 18, 4, '#293e4326')
      + `<g opacity="${opacity}" transform="translate(0 ${bounce}) translate(32 51) rotate(${tilt}) scale(1 ${squash}) translate(-32 -51)">${arms}${boots}${body}</g>${deathMarks}`);
  }
  writeFileSync(resolve(directory, `${id}-atlas.svg`), svg(512, 384, frames.map((frame, index) => `<g transform="translate(${index % 8 * 64} ${Math.floor(index / 8) * 64})">${frame}</g>`).join('')));
  writeFileSync(resolve(directory, `${id}-preview.svg`), svg(64, 64, frames[0]!));
}
