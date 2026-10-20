import Phaser from 'phaser';
import type { GameplayEvent, ItemKind, WorldState } from '../match/index.js';
import { appearance } from './appearance.js';
import { interpolatePosition } from './interpolate-position.js';
import { arenaLayout } from './layout.js';
import { NormalBoard } from './normal-board.js';
import type { ReadyTheme } from '../resources/index.js';
import { createSkinPlayback, type ActorPose, type SkinPlayback } from '../resources/skin-playback.js';
import { ActorCards } from './actor-cards.js';
import { actorIdentity } from './actor-identity.js';
import { createFeedback } from '../presentation/feedback.js';
import { FeedbackAudio } from './feedback-audio.js';
import { readFeedbackSettings } from './feedback-settings.js';
import { drawFeedback } from './feedback-drawing.js';

const colors = {
  background: 0x102b2c, floor: 0x173737, grid: 0x2b4c48, wall: 0x496562, wallEdge: 0x79958c,
  crate: 0x876c42, gold: 0xf1ca7c, player: 0x83dfb6, fire: 0xc95f45, ink: 0xeaf3ed,
};
const board = { x: 0, y: 0, cell: arenaLayout.board.cell };
const itemDisplay = {
  'item.capacity': { label: '容量', color: 0xf1ca7c, ability: 'bombCapacity' },
  'item.range': { label: '距离', color: 0xffaf8c, ability: 'blastRange' },
  'item.speed': { label: '速度', color: 0x83dfb6, ability: 'speed' },
} as const;
/** The view reads gameplay facts; drawing and event history never alter the match. */
export class MatchView {
  private normalBoard: NormalBoard | undefined;
  private mode: 'normal' | 'entities' = 'normal';
  private current: { world: WorldState; alpha: number };
  private readonly root: Phaser.GameObjects.Container;
  private readonly boardRoot: Phaser.GameObjects.Container;
  private readonly boardGraphics: Phaser.GameObjects.Graphics;
  private readonly actorCards: ActorCards;
  private revision = -1;
  private latestChange = '';
  private consumedEvents = 0;
  private readonly feedback: ReturnType<typeof createFeedback>;
  private readonly audio: FeedbackAudio;
  private readonly feedbackGraphics: Phaser.GameObjects.Graphics;
  private volume = -1;
  private readonly skinPlayback: SkinPlayback<HTMLImageElement>;
  private poses: readonly ActorPose<HTMLImageElement>[] = [];
  private animationPaused = false;

  constructor(private readonly scene: Phaser.Scene, world: WorldState, private readonly theme: ReadyTheme<HTMLImageElement>, private readonly arena: 'generated' | 'training' | 'items' | 'escape' | 'normal' = 'training') {
    this.current = { world, alpha: 0 };
    this.skinPlayback = createSkinPlayback(theme);
    this.feedback = createFeedback(world, readFeedbackSettings());
    this.audio = new FeedbackAudio(scene, theme.id);
    this.root = scene.add.container();
    const area = arenaLayout.board;
    const cell = Math.min(area.cell, area.width / world.initialMap.width, area.height / world.initialMap.height);
    const scale = cell / area.cell;
    this.boardRoot = scene.add.container(area.x + (area.width - world.initialMap.width * cell) / 2, area.y + (area.height - world.initialMap.height * cell) / 2).setScale(scale);
    this.boardGraphics = scene.add.graphics();
    this.boardRoot.add(this.boardGraphics); this.root.add(this.boardRoot);
    this.normalBoard = new NormalBoard(scene, this.boardRoot, theme);
    this.feedbackGraphics = scene.add.graphics(); this.boardRoot.add(this.feedbackGraphics);
    this.actorCards = new ActorCards(scene, this.root, world, theme, this.arena);
    this.present(world, 0, []);
  }

  present(world: WorldState, alpha: number, events: readonly GameplayEvent[], deltaMs = 0, animationPaused = false): void {
    if (this.revision !== arenaLayout.revision) {
      this.revision = arenaLayout.revision;
      const area = arenaLayout.board, s = arenaLayout.cssScale;
      const cell = Math.min(area.cell, area.width / world.initialMap.width, area.height / world.initialMap.height);
      this.boardRoot.setPosition(area.x + (area.width - world.initialMap.width * cell) / 2, area.y + (area.height - world.initialMap.height * cell) / 2).setScale(cell / area.cell);
      this.scene.game.canvas.dataset.boardViewport = JSON.stringify({ x: this.boardRoot.x * s, y: this.boardRoot.y * s,
        width: world.initialMap.width * cell * s, height: world.initialMap.height * cell * s, cell: cell * s });
    }
    this.animationPaused = animationPaused;
    this.poses = this.skinPlayback.present(world, deltaMs, animationPaused);
    const settings = readFeedbackSettings(); this.feedback.configure(settings);
    const feedback = this.feedback.present(world, events, deltaMs, { paused: animationPaused, visible: this.mode === 'normal' });
    if (animationPaused || this.mode === 'entities' || this.volume !== settings.volume) this.audio.stop();
    this.volume = settings.volume; this.audio.play(feedback.sounds);
    for (const event of feedback.events) {
      this.consumedEvents += 1;
      const seconds = (event.tick / world.initialization.rules.tickRate).toFixed(1);
      const descriptions: Record<GameplayEvent['type'], string> = {
        'bomb-placed': '放下炸弹', 'bomb-exploded': '炸弹引爆', 'blocker-destroyed': '障碍被炸开',
        'actor-eliminated': '角色淘汰', 'match-ended': '本局结束',
        'item-spawned': '出现道具', 'item-collected': '拾取道具', 'item-destroyed': '道具被烧毁',
      };
      let description = descriptions[event.type];
      if (event.type === 'item-collected') {
        const display = itemDisplay[event.kind];
        description = event.actorId === world.initialization.playerId ? `${display.label}升至 ${event.abilities[display.ability]}` : `目标拾取${display.label}`;
      }
      this.latestChange = `${seconds}s ${description}`;
    }
    const g = this.boardGraphics.clear();
    g.lineStyle(1, colors.grid);
    for (let y = 0; y < world.initialMap.height; y++) {
      for (let x = 0; x < world.initialMap.width; x++) {
        const px = board.x + x * board.cell, py = board.y + y * board.cell;
        g.fillStyle(colors.floor).fillRect(px + 1, py + 1, board.cell - 2, board.cell - 2);
        g.strokeRect(px, py, board.cell, board.cell);
      }
    }
    for (const wall of world.blockers) {
      const x = board.x + wall.x * board.cell + 7, y = board.y + wall.y * board.cell + 7;
      g.fillStyle(wall.type === 'solid-wall' ? colors.wall : colors.crate).fillRoundedRect(x, y, 46, 46, 3);
      g.lineStyle(2, wall.type === 'solid-wall' ? colors.wallEdge : colors.gold).strokeRoundedRect(x, y, 46, 46, 3);
      if (wall.type === 'breakable-wall') { g.lineBetween(x + 10, y + 10, x + 36, y + 36); g.lineBetween(x + 36, y + 10, x + 10, y + 36); }
      else g.lineBetween(x + 10, y + 13, x + 36, y + 13);
    }
    for (const item of world.items) this.drawItem(g, item.type, board.x + item.x * board.cell + 30, board.y + item.y * board.cell + 30, item.active ? 1 : 0.4);
    for (const hazard of world.hazards) {
      for (const cell of hazard.cells) {
        const x = board.x + cell.x * board.cell + 30, y = board.y + cell.y * board.cell + 30;
        g.fillStyle(colors.fire, 0.85).fillRect(x - 26, y - 26, 52, 52);
        g.lineStyle(5, 0xffdec5).lineBetween(x - 13, y, x + 13, y).lineBetween(x, y - 13, x, y + 13);
      }
    }
    for (const bomb of world.bombs) {
      const x = board.x + bomb.x * board.cell + 30, y = board.y + bomb.y * board.cell + 30;
      g.fillStyle(0x071d20).fillCircle(x, y, 19);
      g.lineStyle(2, colors.ink).strokeCircle(x, y, 19);
      const duration = bomb.detonateAtTick - bomb.placedAtTick;
      const remaining = Math.max(0, (bomb.detonateAtTick - world.tick) / duration);
      g.lineStyle(3, colors.gold).beginPath().arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2).strokePath();
      g.lineStyle(3, colors.gold).lineBetween(x + 8, y - 14, x + 15, y - 24);
    }
    for (const actor of world.actors) {
      if (!actor.alive) continue;
      const blend = world.result ? 1 : Math.max(0, Math.min(1, alpha));
      const position = interpolatePosition(actor, blend);
      const x = board.x + position.x * board.cell;
      const y = board.y + position.y * board.cell;
      const player = actor.id === world.initialization.playerId;
      g.fillStyle(actorIdentity(world, actor).color);
      if (player) g.fillPoints([{ x, y: y - 22 }, { x: x + 22, y }, { x, y: y + 22 }, { x: x - 22, y }], true);
      else g.fillCircle(x, y, 20);
      if (actor.ai) g.lineStyle(2, colors.player).strokeCircle(x, y, 23);
    }
    this.actorCards.present(world, feedback.effects, this.latestChange);
    this.scene.game.canvas.dataset.consumedEvents = String(this.consumedEvents);
    this.current = { world, alpha };
    this.boardGraphics.setVisible(this.mode === 'entities');
    this.normalBoard?.present(world, alpha, this.poses, animationPaused);
    if (this.mode === 'normal') drawFeedback(this.feedbackGraphics, feedback.effects, feedback.danger, this.theme.id, settings.reducedMotion, appearance().mode);
    else this.feedbackGraphics.clear();
    if (!this.normalBoard) delete this.scene.game.canvas.dataset.actorAnimations;
    this.scene.game.canvas.dataset.view = this.mode;
    this.scene.game.canvas.dataset.theme = this.theme.id;
    this.scene.game.canvas.dataset.skin = this.theme.package.skin?.id ?? '';
    this.scene.game.canvas.dataset.feedbackEffects = JSON.stringify(feedback.effects);
    this.scene.game.canvas.dataset.feedbackDanger = JSON.stringify(feedback.danger);
    this.scene.game.canvas.dataset.feedbackParticles = String(feedback.effects.reduce((sum, effect) => sum + effect.particles, 0));
    this.scene.game.canvas.dataset.feedbackAudio = JSON.stringify(this.audio.read());
    this.scene.game.canvas.dataset.feedbackSettings = JSON.stringify(settings);
  }

  toggleMode(): void {
    this.mode = this.mode === 'normal' ? 'entities' : 'normal';
    this.normalBoard?.destroy();
    this.normalBoard = this.mode === 'normal' ? new NormalBoard(this.scene, this.boardRoot, this.theme) : undefined;
    this.present(this.current.world, this.current.alpha, [], 0, this.animationPaused);
  }

  stopAudio(): void { this.audio.stop(); }
  destroy(): void { this.feedback.dispose(); this.audio.dispose(); this.actorCards.destroy(); this.root.destroy(true); }

  private drawItem(g: Phaser.GameObjects.Graphics, kind: ItemKind, x: number, y: number, alpha = 1): void {
    g.fillStyle(colors.background, alpha).fillRoundedRect(x - 13, y - 10, 26, 20, 3);
    g.lineStyle(2, itemDisplay[kind].color, alpha);
    if (kind === 'item.capacity') g.strokeCircle(x - 5, y, 5).strokeCircle(x + 5, y, 5);
    if (kind === 'item.range') {
      g.lineBetween(x - 9, y, x + 9, y).lineBetween(x, y - 8, x, y + 8);
      g.lineBetween(x - 9, y, x - 5, y - 4).lineBetween(x + 9, y, x + 5, y + 4);
      g.lineBetween(x, y - 8, x + 4, y - 4).lineBetween(x, y + 8, x - 4, y + 4);
    }
    if (kind === 'item.speed') {
      g.lineBetween(x - 8, y - 6, x - 2, y).lineBetween(x - 2, y, x - 8, y + 6);
      g.lineBetween(x + 1, y - 6, x + 7, y).lineBetween(x + 7, y, x + 1, y + 6);
    }
  }

}
