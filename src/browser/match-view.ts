import Phaser from 'phaser';
import type { GameplayEvent, ItemKind, WorldState } from '../match/index.js';
import { appearance, hex } from './appearance.js';
import { resultLabels } from './result-labels.js';
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
const font = '"Segoe UI", "Microsoft YaHei", sans-serif';
const board = { x: 0, y: 0, cell: arenaLayout.board.cell };
const itemDisplay = {
  'item.capacity': { label: '容量', color: 0xf1ca7c, ability: 'bombCapacity' },
  'item.range': { label: '距离', color: 0xffaf8c, ability: 'blastRange' },
  'item.speed': { label: '速度', color: 0x83dfb6, ability: 'speed' },
} as const;
const aiLabels = { observing: '观察中', safe: '安全', escaping: '逃生中', collecting: '拾取道具', breaking: '炸开障碍', threatening: '接近对手', 'no-route': '未找到安全路', 'budget-exhausted': '搜索预算不足', eliminated: '已淘汰' } as const;

/** The view reads gameplay facts; drawing and event history never alter the match. */
export class MatchView {
  private normalBoard: NormalBoard | undefined;
  private mode: 'normal' | 'entities' = 'normal';
  private current: { world: WorldState; alpha: number };
  private readonly root: Phaser.GameObjects.Container;
  private readonly boardRoot: Phaser.GameObjects.Container;
  private readonly boardGraphics: Phaser.GameObjects.Graphics;
  private readonly actorCards: ActorCards;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly progress: Phaser.GameObjects.Text;
  private readonly history: Phaser.GameObjects.Text;
  private readonly result: Phaser.GameObjects.Container;
  private readonly resultTitle: Phaser.GameObjects.Text;
  private readonly resultActions: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly timerLabel: Phaser.GameObjects.Text;
  private readonly keyboardHelp: Phaser.GameObjects.Text;
  private readonly seedLabel: Phaser.GameObjects.Text;
  private revision = -1;
  private appearanceMode = '';
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
    this.actorCards = new ActorCards(scene, this.root, world, theme);
    this.title = this.text(24, 18, 'Fake Bomb It', 32, '#eaf3ed', '600');
    const arenaTitles = { generated: '种子地图', normal: '正常 AI 练习场', training: '实体训练场', items: '道具练习场', escape: '逃生练习场' };
    this.subtitle = this.text(24, 63, this.arena === 'generated' ? `1 对 ${world.actors.length - 1} · 正常难度` : `${arenaTitles[this.arena]} · 横屏游玩`, 20, '#b8d1c6');
    this.timerLabel = this.text(688, 18, '剩余时间', 17, '#b8d1c6');
    this.timer = this.text(688, 43, '02:00', 32, '#eaf3ed', '600');
    this.progress = this.text(386, 22, '', 22, '#eaf3ed');
    const arenaHelp = { generated: '拾取道具，炸开通路', normal: '放弹封口后向左、向下躲开', training: '炸开障碍后等待火焰消失', items: '向上、向右拾取三类道具', escape: '观察 AI 躲开连锁危险' };
    this.history = this.text(386, 58, arenaHelp[this.arena], 15, '#b8d1c6');
    this.keyboardHelp = this.text(24, 553, 'WASD / 方向键移动', 14, '#b8d1c6');
    const seed = world.initialization.seed;
    this.seedLabel = this.text(242, 550, `种子 ${seed.length > 24 ? `${seed.slice(0, 23)}…` : seed}  ·  ${world.initialMap.width} × ${world.initialMap.height}`, 14, '#b8d1c6');
    this.result = scene.add.container(0, 0).setVisible(false);
    this.root.add(this.result);
    const shade = scene.add.rectangle(512, 310, 510, 232, colors.background, 0.97).setStrokeStyle(2, colors.player);
    this.resultTitle = scene.add.text(512, 270, '', { fontFamily: font, fontSize: '34px', fontStyle: 'bold', color: '#eaf3ed' }).setOrigin(0.5);
    this.resultActions = scene.add.text(512, 354, '重试本局：R / 右下角\n新开一局：N / 左下角\n返回菜单：M / 右上角', { fontFamily: font, fontSize: '21px', color: '#83dfb6', align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.result.add([shade, this.resultTitle, this.resultActions]);
    this.present(world, 0, []);
  }

  present(world: WorldState, alpha: number, events: readonly GameplayEvent[], deltaMs = 0, animationPaused = false): void {
    const palette = appearance();
    if (this.appearanceMode !== palette.mode) {
      this.appearanceMode = palette.mode;
      for (const text of [this.title, this.timer, this.progress]) text.setColor(hex(palette.ink));
      for (const text of [this.subtitle, this.timerLabel, this.history, this.keyboardHelp, this.seedLabel]) text.setColor(hex(palette.muted));
    }
    if (this.revision !== arenaLayout.revision) {
      this.revision = arenaLayout.revision;
      const layout = arenaLayout, area = layout.board, s = layout.cssScale;
      const cell = Math.min(area.cell, area.width / world.initialMap.width, area.height / world.initialMap.height);
      this.boardRoot.setPosition(area.x + (area.width - world.initialMap.width * cell) / 2, area.y + (area.height - world.initialMap.height * cell) / 2).setScale(cell / area.cell);
      this.title.setPosition(layout.title.x, layout.title.y).setFontSize(layout.compact ? 16 / s : 32);
      this.timer.setPosition(layout.timer.x, layout.timer.y).setFontSize(layout.compact ? 18 / s : 32);
      this.progress.setPosition(layout.progress.x, layout.progress.y).setFontSize(layout.compact ? 12 / s : 22).setVisible(!layout.compact || layout.active);
      this.history.setPosition(area.x + 144, 58).setVisible(!layout.compact);
      this.timerLabel.setPosition(area.x + 446, 18).setVisible(!layout.compact);
      this.subtitle.setVisible(!layout.compact); this.keyboardHelp.setVisible(!layout.compact);
      this.keyboardHelp.setY(layout.height - 23); this.seedLabel.setPosition(area.x, layout.height - 26).setVisible(!layout.compact);
      const resultScale = Math.min(1.3, (area.width - 8 / s) / 510, (area.height - 8 / s) / 232);
      this.result.setPosition(area.x + area.width / 2 - 512 * resultScale, area.y + area.height / 2 - 310 * resultScale).setScale(resultScale);
      this.resultTitle.setFontSize(layout.compact ? 20 / s / resultScale : 34);
      this.resultActions.setFontSize(layout.compact ? 13 / s / resultScale : 21)
        .setText(layout.compact ? '右侧重试本局\n左侧新开一局\n右侧返回菜单' : '重试本局：R / 右下角\n新开一局：N / 左下角\n返回菜单：M / 右上角');
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
    if (this.latestChange) this.history.setText(this.latestChange);
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
    this.actorCards.present(world, feedback.effects);
    const opponents = world.actors.filter(actor => actor.id !== world.initialization.playerId);
    const ai = opponents.find(actor => actor.ai)?.ai;
    this.progress.setText(ai && this.arena === 'escape' ? `AI：${aiLabels[ai.status]}` : `${this.arena === 'generated' ? '对手' : '目标'}剩余  ${opponents.filter(actor => actor.alive).length} / ${opponents.length}`);
    const remaining = Math.max(0, Math.ceil(world.initialization.rules.matchDurationSeconds - world.tick / world.initialization.rules.tickRate));
    this.timer.setText(`${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`);
    this.result.setVisible(world.result !== null);
    if (world.result) this.resultTitle.setText(resultLabels[world.result.outcome]);
    this.scene.game.canvas.dataset.consumedEvents = String(this.consumedEvents);
    this.current = { world, alpha };
    this.boardGraphics.setVisible(this.mode === 'entities');
    this.normalBoard?.present(world, alpha, this.poses, animationPaused);
    if (this.mode === 'normal') drawFeedback(this.feedbackGraphics, feedback.effects, feedback.danger, this.theme.id, settings.reducedMotion);
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
  destroy(): void { this.feedback.dispose(); this.audio.dispose(); this.root.destroy(true); }

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

  private text(x: number, y: number, content: string, size: number, color: string, weight = 'normal'): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, content, { fontFamily: font, fontSize: `${size}px`, fontStyle: weight, color });
    this.root.add(text);
    return text;
  }
}
