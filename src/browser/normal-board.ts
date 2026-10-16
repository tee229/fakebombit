import Phaser from 'phaser';
import type { WorldState } from '../match/index.js';
import { resolveVisual, visualSlotFor, type ReadyTheme, type VisualSlot } from '../resources/index.js';
import type { ActorPose } from '../resources/skin-playback.js';
import { ActorSprites } from './actor-sprites.js';

/** Synchronizes current facts only. Animation time cannot create or prolong gameplay objects. */
export class NormalBoard {
  private readonly root: Phaser.GameObjects.Container;
  private readonly images = new Map<string, Phaser.GameObjects.Image>();
  private readonly actors: ActorSprites;
  constructor(private readonly scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private readonly theme: ReadyTheme<HTMLImageElement>) {
    this.root = scene.add.container(); parent.addAt(this.root, 1);
    this.actors = new ActorSprites(scene, this.root);
  }
  present(world: WorldState, alpha: number, poses: readonly ActorPose<HTMLImageElement>[], paused: boolean): void {
    const live = new Set<string>();
    const rate = world.initialization.rules.tickRate;
    const draw = (id: string, slot: VisualSlot, x: number, y: number, depth: number, age = 0, opacity = 1) => {
      const visual = resolveVisual(this.theme, slot, age);
      if (!visual) return;
      live.add(id);
      let image = this.images.get(id);
      if (!image) { image = this.scene.add.image(0, 0, visual.image.key, visual.frame); this.root.add(image); this.images.set(id, image); }
      image.setFrame(visual.frame).setOrigin(visual.anchor.x, visual.anchor.y)
        .setPosition(x * 60 + visual.offset.x * 60 / visual.referenceSize.width, y * 60 + visual.offset.y * 60 / visual.referenceSize.height)
        .setScale(60 / visual.referenceSize.width, 60 / visual.referenceSize.height).setDepth(depth).setAlpha(opacity);
    };
    for (let y = 0; y < world.initialMap.height; y++) for (let x = 0; x < world.initialMap.width; x++) draw(`floor:${x}:${y}`, visualSlotFor('floor'), x + 0.5, y + 0.5, 0);
    for (const spawn of world.initialMap.spawns) draw(`spawn:${spawn.id}`, visualSlotFor('spawn'), spawn.x + 0.5, spawn.y + 0.5, 1);
    // Optional scenery stays on fixed walls; it never suggests a traversable cell is blocked.
    for (const wall of world.blockers) {
      draw(`wall:${wall.id}`, visualSlotFor(wall.type), wall.x + 0.5, wall.y + 0.5, 2);
      if (wall.type === 'solid-wall' && wall.x === 0 && wall.y === 0) draw('accent', 'decoration.accent', 0.5, 0.5, 3);
    }
    for (const item of world.items) draw(`item:${item.id}`, visualSlotFor(item.type), item.x + 0.5, item.y + 0.5, 4, 0, item.active ? 1 : 0.4);
    for (const bomb of world.bombs) draw(`bomb:${bomb.id}`, visualSlotFor('bomb'), bomb.x + 0.5, bomb.y + 0.5, 5, (world.tick - bomb.placedAtTick) / rate);
    for (const hazard of world.hazards) for (const cell of hazard.cells) draw(`fire:${hazard.id}:${cell.x}:${cell.y}`, visualSlotFor('fire'), cell.x + 0.5, cell.y + 0.5, 6, (world.tick - hazard.createdAtTick) / rate);
    this.actors.present(world, alpha, poses, paused);
    for (const [id, image] of this.images) if (!live.has(id)) { image.destroy(); this.images.delete(id); }
    this.root.sort('depth');
  }
  destroy(): void { this.root.destroy(true); this.images.clear(); }
}
