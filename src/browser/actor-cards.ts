import Phaser from 'phaser';
import type { WorldState } from '../match/index.js';
import { resolveSkinAnimation, type ReadyTheme } from '../resources/index.js';
import { actorIdentity } from './actor-identity.js';
import { arenaLayout } from './layout.js';

const font = '"Segoe UI", "Microsoft YaHei", sans-serif';

/** Match facts live outside the board, leaving character silhouettes unobstructed. */
export class ActorCards {
  private readonly root: Phaser.GameObjects.Container;
  private readonly cards = new Map<string, { root: Phaser.GameObjects.Container; portrait: Phaser.GameObjects.Image | undefined;
    status: Phaser.GameObjects.Text; values: Phaser.GameObjects.Text[] }>();

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, world: WorldState, theme: ReadyTheme<HTMLImageElement>) {
    this.root = scene.add.container(); parent.add(this.root);
    const layout = arenaLayout.actorCards;
    const portrait = resolveSkinAnimation(theme, 'idle', 'down');
    world.actors.forEach((actor, index) => {
      const identity = actorIdentity(world, actor);
      const root = scene.add.container(index < 2 ? layout.left : layout.right, layout.top + index % 2 * (layout.height + layout.gap));
      this.root.add(root);
      root.add(scene.add.rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, identity.player ? 0x24483f : 0x173737)
        .setStrokeStyle(identity.player ? 2 : 1, identity.color, identity.player ? 1 : 0.65));
      const text = (x: number, y: number, value: string, size: number, color = '#eaf3ed') => {
        const item = scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color }); root.add(item); return item;
      };
      const image = portrait ? scene.add.image(30, 27, portrait.image.key, portrait.frame).setDisplaySize(40, 40) : undefined;
      if (image) root.add(image);
      text(60, 7, identity.name, 21).setColor(`#${identity.color.toString(16).padStart(6, '0')}`);
      const status = text(60, 33, '', 13, '#b8d1c6');
      const values = ['炸弹', '距离', '速度'].map((label, column) => {
        const x = 39 + column * 64;
        text(x, 47, label, 14, '#b8d1c6').setOrigin(0.5, 0);
        return text(x, 63, '', 17).setOrigin(0.5, 0);
      });
      this.cards.set(actor.id, { root, portrait: image, status, values });
    });
  }

  present(world: WorldState): void {
    const summary = world.actors.map(actor => {
      const card = this.cards.get(actor.id)!;
      const bombs = world.bombs.filter(bomb => bomb.ownerId === actor.id).length;
      card.status.setText(actor.alive ? '存活' : '已淘汰').setColor(actor.alive ? '#b8d1c6' : '#ffaf8c');
      card.portrait?.setAlpha(actor.alive ? 1 : 0.35);
      const values = [`${bombs}/${actor.abilities.bombCapacity}`, String(actor.abilities.blastRange), String(Number(actor.abilities.speed.toFixed(2)))];
      card.values.forEach((text, index) => text.setText(values[index]!).setColor(actor.alive ? '#eaf3ed' : '#b8d1c6'));
      return { id: actor.id, name: actorIdentity(world, actor).name, alive: actor.alive, bombs, ...actor.abilities,
        bounds: { x: card.root.x, y: card.root.y, width: arenaLayout.actorCards.width, height: arenaLayout.actorCards.height } };
    });
    this.root.scene.game.canvas.dataset.actorCards = JSON.stringify(summary);
  }
}
