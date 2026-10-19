import Phaser from 'phaser';
import type { WorldState } from '../match/index.js';
import { resolveSkinAnimation, type ReadyTheme } from '../resources/index.js';
import { appearance, hex } from './appearance.js';
import { actorIdentity } from './actor-identity.js';
import { arenaLayout } from './layout.js';
import type { FeedbackEffect } from '../presentation/feedback.js';

const font = '"Segoe UI", "Microsoft YaHei", sans-serif';

/** Match facts live outside the board, leaving character silhouettes unobstructed. */
export class ActorCards {
  private readonly root: Phaser.GameObjects.Container;
  private readonly cards = new Map<string, { root: Phaser.GameObjects.Container; portrait: Phaser.GameObjects.Image | undefined;
    background: Phaser.GameObjects.Rectangle; name: Phaser.GameObjects.Text; captions: Phaser.GameObjects.Text[];
    status: Phaser.GameObjects.Text; values: Phaser.GameObjects.Text[]; index: number }>();
  private revision = -1;
  private appearanceMode = '';

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, world: WorldState, theme: ReadyTheme<HTMLImageElement>) {
    this.root = scene.add.container(); parent.add(this.root);
    const layout = arenaLayout.actorCards;
    const portrait = resolveSkinAnimation(theme, 'idle', 'down');
    world.actors.forEach((actor, index) => {
      const identity = actorIdentity(world, actor);
      const root = scene.add.container(index < 2 ? layout.left : layout.right, layout.top + index % 2 * (layout.height + layout.gap));
      this.root.add(root);
      const background = scene.add.rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, identity.player ? 0x24483f : 0x173737)
        .setStrokeStyle(identity.player ? 2 : 1, identity.color, identity.player ? 1 : 0.65);
      root.add(background);
      const text = (x: number, y: number, value: string, size: number, color = '#eaf3ed') => {
        const item = scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color }); root.add(item); return item;
      };
      const image = portrait ? scene.add.image(30, 27, portrait.image.key, portrait.frame).setDisplaySize(40, 40) : undefined;
      if (image) root.add(image);
      const name = text(60, 7, identity.name, 21).setColor(`#${identity.color.toString(16).padStart(6, '0')}`);
      const status = text(60, 33, '', 13, '#b8d1c6');
      const captions: Phaser.GameObjects.Text[] = [];
      const values = ['炸弹', '距离', '速度'].map((label, column) => {
        const x = 39 + column * 64;
        captions.push(text(x, 47, label, 14, '#b8d1c6').setOrigin(0.5, 0));
        return text(x, 63, '', 17).setOrigin(0.5, 0);
      });
      this.cards.set(actor.id, { root, portrait: image, status, values, background, name, captions, index });
    });
  }

  present(world: WorldState, effects: readonly FeedbackEffect[] = []): void {
    const { compact, cssScale: s } = arenaLayout, layout = arenaLayout.actorCards;
    this.root.setVisible(!compact || arenaLayout.active);
    if (this.revision !== arenaLayout.revision) {
      this.revision = arenaLayout.revision;
      for (const card of this.cards.values()) {
        card.root.setPosition(card.index < 2 ? layout.left : layout.right, (card.index < 2 ? layout.top : layout.rightTop) + card.index % 2 * (layout.height + layout.gap));
        card.background.setPosition(layout.width / 2, layout.height / 2).setSize(layout.width, layout.height);
        card.portrait?.setPosition(compact ? 17 / s : 30, compact ? 14 / s : 27).setDisplaySize(compact ? 24 / s : 40, compact ? 24 / s : 40);
        card.name.setPosition(compact ? 36 / s : 60, compact ? 1 / s : 7).setFontSize(compact ? 13 / s : 21);
        card.status.setPosition(compact ? layout.width - 7 / s : 60, compact ? 3 / s : 33)
          .setOrigin(compact ? 1 : 0, 0).setFontSize(compact ? 10 / s : 13);
        card.values.forEach((value, index) => {
          value.setPosition(compact ? (36 / s + (layout.width - 40 / s) * index / 3) : 39 + index * 64, compact ? 15 / s : 63)
            .setOrigin(compact ? 0 : .5, 0).setFontSize(compact ? 11 / s : 17);
          card.captions[index]!.setVisible(!compact);
        });
      }
    }
    const palette = appearance();
    const appearanceChanged = this.appearanceMode !== palette.mode; this.appearanceMode = palette.mode;
    const summary = world.actors.map(actor => {
      const card = this.cards.get(actor.id)!;
      const identity = actorIdentity(world, actor);
      if (appearanceChanged) {
        const accent = palette.mode === 'light' ? identity.lightColor : identity.color;
        card.background.setFillStyle(identity.player ? palette.selected : palette.surface).setStrokeStyle(identity.player ? 2 : 1, accent);
        card.name.setColor(hex(accent));
        for (const caption of card.captions) caption.setColor(hex(palette.muted));
      }
      const bombs = world.bombs.filter(bomb => bomb.ownerId === actor.id).length;
      const gain = effects.findLast(effect => effect.kind === 'pickup' && effect.actorId === actor.id)?.label;
      card.status.setText(actor.alive ? gain ?? '存活' : '已淘汰').setColor(hex(actor.alive ? gain ? palette.accent : palette.muted : palette.warning));
      card.portrait?.setAlpha(actor.alive ? 1 : 0.35);
      const values = [`${bombs}/${actor.abilities.bombCapacity}`, String(actor.abilities.blastRange), String(Number(actor.abilities.speed.toFixed(2)))];
      card.values.forEach((text, index) => text.setText(`${compact ? ['弹', '距', '速'][index] : ''}${values[index]!}`).setColor(hex(actor.alive ? palette.ink : palette.muted)));
      return { id: actor.id, name: actorIdentity(world, actor).name, alive: actor.alive, gain: gain ?? '', bombs, ...actor.abilities,
        bounds: { x: card.root.x, y: card.root.y, width: arenaLayout.actorCards.width, height: arenaLayout.actorCards.height } };
    });
    this.root.scene.game.canvas.dataset.actorCards = JSON.stringify(summary);
  }
}
