import Phaser from 'phaser';
import type { WorldState } from '../match/index.js';
import type { ActorPose } from '../resources/skin-playback.js';
import { interpolatePosition } from './interpolate-position.js';

/** Phaser plays the declared frames; all timing and movement here are purely cosmetic. */
export class ActorSprites {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  constructor(private readonly scene: Phaser.Scene, private readonly root: Phaser.GameObjects.Container) {}

  present(world: WorldState, alpha: number, poses: readonly ActorPose<HTMLImageElement>[], paused: boolean): void {
    const live = new Set<string>();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const pose of poses) {
      const actor = world.actors.find(actor => actor.id === pose.id)!;
      const { visual } = pose;
      const key = JSON.stringify(['skin', visual.image.key, pose.action, pose.direction, visual.frames, visual.framesPerSecond, visual.loop]);
      if (!this.scene.anims.exists(key)) this.scene.anims.create({ key,
        frames: visual.frames.map(frame => ({ key: visual.image.key, frame })), frameRate: visual.framesPerSecond, repeat: visual.loop ? -1 : 0,
      });
      live.add(actor.id);
      let sprite = this.sprites.get(actor.id);
      if (!sprite) { sprite = this.scene.add.sprite(0, 0, visual.image.key, visual.frame); this.root.add(sprite); this.sprites.set(actor.id, sprite); }
      if (sprite.anims.currentAnim?.key !== key) sprite.play({ key, startFrame: visual.frameIndex });
      const freeze = paused || reducedMotion || (world.result !== null && actor.alive);
      if (freeze) sprite.anims.pause(); else sprite.anims.resume();
      if (reducedMotion) sprite.anims.setCurrentFrame(sprite.anims.currentAnim!.frames[0]!);
      const position = interpolatePosition(actor, world.result || !actor.alive ? 1 : alpha);
      sprite.setOrigin(visual.anchor.x, visual.anchor.y).setFlipX(visual.flipX)
        .setPosition(position.x * 60 + visual.offset.x * 60 / visual.referenceSize.width, position.y * 60 + visual.offset.y * 60 / visual.referenceSize.height)
        .setScale(60 / visual.referenceSize.width, 60 / visual.referenceSize.height).setDepth(7);
    }
    for (const [id, sprite] of this.sprites) if (!live.has(id)) { sprite.destroy(); this.sprites.delete(id); }
    this.scene.game.canvas.dataset.actorAnimations = JSON.stringify(poses.map(pose => ({ id: pose.id, action: pose.action, direction: pose.direction,
      frame: this.sprites.get(pose.id)?.frame.name, age: Number(pose.ageSeconds.toFixed(3)), flipX: pose.visual.flipX })));
  }
}
