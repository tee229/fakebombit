import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Original synthesized PCM. This authoring-only noise stream never enters gameplay.
const directory = resolve('public/audio'); mkdirSync(directory, { recursive: true });
const rate = 22050;
for (const theme of ['candy', 'factory']) for (const kind of ['explosion', 'break', 'pickup', 'elimination']) {
  const candy = theme === 'candy', duration = kind === 'elimination' ? .36 : kind === 'pickup' ? .28 : .22;
  const samples = Math.ceil(rate * duration), wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  let noise = 7291, phase = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / rate, p = t / duration;
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const random = noise / 0xffffffff * 2 - 1;
    const frequency = kind === 'pickup' ? (candy ? 660 : 520) * (p < .35 ? 1 : p < .65 ? 1.25 : 1.5)
      : kind === 'explosion' ? 45 + 115 * (1 - p) ** 3 : kind === 'break' ? (candy ? 310 : 230) * (1 - p * .55) : 110 + 330 * (1 - p) ** 2;
    phase += Math.PI * 2 * frequency / rate;
    const envelope = Math.min(1, t / .008) * (1 - p) ** 2;
    const tone = Math.sin(phase) + (candy ? .12 : .25) * Math.sin(phase * (kind === 'break' ? 2.7 : 2));
    const value = (kind === 'explosion' ? .11 * random + .11 * tone : kind === 'break' ? .07 * random + .1 * tone : .17 * tone) * envelope;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  writeFileSync(resolve(directory, `${theme}-${kind}.wav`), wav);
}
