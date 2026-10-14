import Phaser from 'phaser';
import type { GameplayEvent, WorldState } from '../match/index.js';
import { resultLabels } from './result-labels.js';
import { interpolatePosition } from './interpolate-position.js';
import { arenaLayout } from './layout.js';

const colors = {
  background: 0x102b2c, floor: 0x173737, grid: 0x2b4c48, wall: 0x496562, wallEdge: 0x79958c,
  crate: 0x876c42, gold: 0xf1ca7c, player: 0x83dfb6, fire: 0xc95f45, ink: 0xeaf3ed,
};
const font = '"Segoe UI", "Microsoft YaHei", sans-serif';
const board = arenaLayout.board;

/** The view reads gameplay facts; drawing and event history never alter the match. */
export class EntitiesView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly actorLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly timer: Phaser.GameObjects.Text;
  private readonly progress: Phaser.GameObjects.Text;
  private readonly capacity: Phaser.GameObjects.Text;
  private readonly history: Phaser.GameObjects.Text;
  private readonly result: Phaser.GameObjects.Container;
  private readonly resultTitle: Phaser.GameObjects.Text;
  private readonly changes: string[] = [];
  private cursor = { tick: -1, order: -1 };
  private consumedEvents = 0;

  constructor(private readonly scene: Phaser.Scene, world: WorldState) {
    this.root = scene.add.container();
    this.graphics = scene.add.graphics();
    this.root.add(this.graphics);
    this.text(24, 18, 'Fake Bomb It', 32, '#eaf3ed', '600');
    this.text(24, 63, '实体训练场 · 横屏游玩', 20, '#b8d1c6');
    this.text(688, 18, '剩余时间', 17, '#b8d1c6');
    this.timer = this.text(688, 43, '02:00', 32, '#eaf3ed', '600');
    this.progress = this.text(386, 22, '', 22, '#eaf3ed');
    this.capacity = this.text(386, 58, '', 20, '#b8d1c6');
    this.text(24, 110, '场上变化', 22, '#eaf3ed', '600');
    this.history = this.text(24, 152, '放弹后\n离开十字范围', 18, '#b8d1c6');
    this.text(24, 538, 'WASD / 方向键', 18, '#b8d1c6');
    const legend = [['固定墙', '#79958c'], ['可破坏障碍', '#f1ca7c'], ['炸弹', '#eaf3ed'], ['有效火焰', '#ffaf8c']] as const;
    for (const [index, [label, color]] of legend.entries()) this.text(274 + index * 135, 543, label, 16, color);

    world.actors.forEach((actor, index) => {
      const label = actor.id === world.initialization.playerId ? 'P' : String(index).padStart(2, '0');
      const text = this.text(0, 0, label, 18, '#102b2c', '700').setOrigin(0.5);
      this.actorLabels.set(actor.id, text);
    });
    this.result = scene.add.container(0, 0).setVisible(false);
    this.root.add(this.result);
    const shade = scene.add.rectangle(512, 310, 510, 205, colors.background, 0.97).setStrokeStyle(2, colors.player);
    this.resultTitle = scene.add.text(512, 270, '', { fontFamily: font, fontSize: '34px', fontStyle: 'bold', color: '#eaf3ed' }).setOrigin(0.5);
    const retry = scene.add.text(512, 343, '点击右侧重试 / 按 R', { fontFamily: font, fontSize: '22px', color: '#83dfb6' }).setOrigin(0.5);
    this.result.add([shade, this.resultTitle, retry]);
    this.present(world, 0, []);
  }

  present(world: WorldState, alpha: number, events: readonly GameplayEvent[]): void {
    for (const event of events) {
      if (event.tick < this.cursor.tick || (event.tick === this.cursor.tick && event.order <= this.cursor.order)) continue;
      this.cursor = { tick: event.tick, order: event.order };
      this.consumedEvents += 1;
      const seconds = (event.tick / world.initialization.rules.tickRate).toFixed(1);
      const descriptions: Record<GameplayEvent['type'], string> = {
        'bomb-placed': '放下炸弹', 'bomb-exploded': '炸弹引爆', 'blocker-destroyed': '障碍被炸开',
        'actor-eliminated': '角色淘汰', 'match-ended': '本局结束',
      };
      this.changes.unshift(`${seconds}s ${descriptions[event.type]}`);
      this.changes.length = Math.min(this.changes.length, 3);
    }
    if (this.changes.length) this.history.setText(this.changes.join('\n')).setLineSpacing(12);
    const g = this.graphics.clear();
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
      const label = this.actorLabels.get(actor.id)!;
      label.setVisible(actor.alive);
      if (!actor.alive) continue;
      const blend = world.result ? 1 : Math.max(0, Math.min(1, alpha));
      const position = interpolatePosition(actor, blend);
      const x = board.x + position.x * board.cell;
      const y = board.y + position.y * board.cell;
      const player = actor.id === world.initialization.playerId;
      g.fillStyle(player ? colors.player : colors.gold);
      if (player) g.fillPoints([{ x, y: y - 22 }, { x: x + 22, y }, { x, y: y + 22 }, { x: x - 22, y }], true);
      else g.fillCircle(x, y, 20);
      label.setPosition(x, y);
    }
    // The legend uses the same geometric grammar, never texture-derived gameplay facts.
    g.fillStyle(colors.wall).fillRect(248, 542, 18, 18);
    g.lineStyle(2, colors.gold).strokeRect(383, 542, 18, 18).lineBetween(385, 544, 399, 558).lineBetween(399, 544, 385, 558);
    g.lineStyle(2, colors.ink).strokeCircle(527, 551, 9);
    g.fillStyle(colors.fire).fillRect(653, 542, 18, 18);
    g.lineStyle(2, 0xffdec5).lineBetween(657, 551, 667, 551).lineBetween(662, 546, 662, 556);
    const opponents = world.actors.filter(actor => actor.id !== world.initialization.playerId);
    this.progress.setText(`目标剩余  ${opponents.filter(actor => actor.alive).length} / ${opponents.length}`);
    this.capacity.setText(`已放炸弹  ${world.bombs.filter(bomb => bomb.ownerId === world.initialization.playerId).length} / ${world.initialization.rules.bombCapacity}`);
    const remaining = Math.max(0, Math.ceil(world.initialization.rules.matchDurationSeconds - world.tick / world.initialization.rules.tickRate));
    this.timer.setText(`${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`);
    this.result.setVisible(world.result !== null);
    if (world.result) this.resultTitle.setText(resultLabels[world.result.outcome]);
    this.scene.game.canvas.dataset.consumedEvents = String(this.consumedEvents);
  }

  destroy(): void { this.root.destroy(true); }

  private text(x: number, y: number, content: string, size: number, color: string, weight = 'normal'): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, content, { fontFamily: font, fontSize: `${size}px`, fontStyle: weight, color });
    this.root.add(text);
    return text;
  }
}
