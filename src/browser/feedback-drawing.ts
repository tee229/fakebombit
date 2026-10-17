import type Phaser from 'phaser';
import type { DangerCell, FeedbackEffect } from '../presentation/feedback.js';

/** Sparse shapes on the existing board coordinates; no timers, callbacks or gameplay writes. */
export function drawFeedback(g: Phaser.GameObjects.Graphics, effects: readonly FeedbackEffect[], danger: readonly DangerCell[], theme: string, reducedMotion: boolean): void {
  g.clear();
  const candy = theme === 'candy', colors = candy ? [0xe79db8, 0xf1ca7c, 0xfff0d7] : [0xce9c68, 0x92c8c4, 0xe9d7a6];
  // Directional cross strokes stay inside precisely the hazardous cells. No fire-colored afterglow.
  for (const { position, connections } of danger) {
    const x = (position.x + .5) * 60, y = (position.y + .5) * 60;
    g.lineStyle(2, 0xfff2bc, .9).strokeRoundedRect(x - 26, y - 26, 52, 52, 5);
    g.lineStyle(3, 0xfff2bc, .85);
    for (const direction of connections) {
      const dx = direction === 'right' ? 24 : direction === 'left' ? -24 : 0;
      const dy = direction === 'down' ? 24 : direction === 'up' ? -24 : 0;
      g.lineBetween(x, y, x + dx, y + dy);
    }
  }
  for (const effect of effects) {
    const p = Math.min(1, effect.ageMs / effect.durationMs), fade = (1 - p) ** 2;
    const x = effect.position.x * 60, y = effect.position.y * 60;
    if (effect.kind === 'explosion') {
      // This impact ring is clipped to one cell and lasts less than the danger cue.
      // It disappears with real fire; only neutral/pastel debris can remain afterward.
      const inFire = danger.some(cell => cell.position.x === Math.floor(effect.position.x) && cell.position.y === Math.floor(effect.position.y));
      if (inFire) g.lineStyle(reducedMotion ? 2 : 4 * (1 - p) + 1, 0xfff2bc, fade).strokeCircle(x, y, reducedMotion ? 23 : 10 + 16 * (1 - (1 - p) ** 3));
    } else if (effect.kind === 'pickup') {
      g.lineStyle(2, 0x83dfb6, fade).strokeCircle(x, y, reducedMotion ? 22 : 20 + p * 10);
    } else if (effect.kind === 'elimination') {
      g.lineStyle(3, candy ? 0xe79db8 : 0x92c8c4, fade).strokeCircle(x, y, reducedMotion ? 20 : 16 + p * 13);
    }
    for (let i = 0; i < effect.particles; i++) {
      const angle = i * 2.399963 + (effect.kind === 'break' ? .4 : 0), radius = 9 + (1 - (1 - p) ** 3) * (11 + i % 4 * 4);
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius + p * p * 10;
      g.fillStyle(colors[i % colors.length]!, fade * .85);
      if (effect.kind === 'break') g.fillRect(px - 3, py - 2, 6, 4);
      else g.fillCircle(px, py, 1.5 + i % 2);
    }
  }
}
