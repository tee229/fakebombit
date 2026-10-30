import type { GameFrame } from '../game-flow/session.js';
import type { ActorState, WorldState } from '../match/index.js';
import { createFeedback } from '../presentation/feedback.js';
import { interpolatePosition } from '../presentation/interpolate-position.js';
import { resolveVisual, type ReadyTheme, type VisualSlot } from '../resources/index.js';
import { createSkinPlayback } from '../resources/skin-playback.js';
import type { Layout } from './layout.js';
import type { Settings } from './preferences.js';
import { drawImage } from './assets.js';

export const actorColors = ['#83dfb6', '#f1ca7c', '#ffaf8c', '#91c8ed'];
export function actorName(world: WorldState, actor: ActorState): string {
  return actor.id === world.initialization.playerId ? '玩家' : `AI ${world.initialization.actors.filter(a => a.id !== world.initialization.playerId).findIndex(a => a.id === actor.id) + 1}`;
}
export class MatchBoard {
  private readonly feedback;
  private readonly playback;
  private readonly terrain: WechatMinigame.Canvas;
  private readonly terrainContext: CanvasRenderingContext2D;
  private terrainKey = '';
  private readonly frames = new Map<string, { frameWidth: number; frameHeight: number }>();
  private poses: ReturnType<ReturnType<typeof createSkinPlayback<WechatMinigame.Image>>['present']> = [];
  private effects: ReturnType<ReturnType<typeof createFeedback>['present']> = { events: [], sounds: [], effects: [], danger: [] };
  constructor(host: Pick<WechatMinigame.Wx, 'createCanvas'>, world: WorldState, readonly theme: ReadyTheme<WechatMinigame.Image>) {
    this.feedback = createFeedback(world); this.playback = createSkinPlayback(theme);
    for (const resource of theme.package.resources) { const image = theme.images[resource.id]; if (image) this.frames.set(image.key, resource); }
    this.terrain = host.createCanvas(); this.terrain.width = world.initialMap.width * 64; this.terrain.height = world.initialMap.height * 64;
    this.terrainContext = this.terrain.getContext('2d') as CanvasRenderingContext2D;
  }
  present(frame: GameFrame, deltaMs: number, paused: boolean, entities: boolean, settings: Readonly<Settings>) {
    this.poses = this.playback.present(frame.world, deltaMs, paused);
    this.feedback.configure(settings);
    this.effects = this.feedback.present(frame.world, frame.events, deltaMs, { paused, visible: !entities });
    return this.effects;
  }
  private sprite(ctx: CanvasRenderingContext2D, visual: Omit<NonNullable<ReturnType<typeof resolveVisual<WechatMinigame.Image>>>, 'facing'>, x: number, y: number, size: number, flip = false): void {
    const image = visual.image.value, definition = this.frames.get(visual.image.key)!;
    const fw = definition.frameWidth, fh = definition.frameHeight, columns = image.width / fw;
    const width = size * fw / visual.referenceSize.width, height = size * fh / visual.referenceSize.height;
    ctx.save();
    ctx.translate(x + visual.offset.x * size / visual.referenceSize.width, y + visual.offset.y * size / visual.referenceSize.height);
    if (flip) ctx.scale(-1, 1);
    drawImage(ctx, image, visual.frame % columns * fw, Math.floor(visual.frame / columns) * fh, fw, fh, -visual.anchor.x * width, -visual.anchor.y * height, width, height);
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, frame: GameFrame, layout: Layout, settings: Readonly<Settings>, entities: boolean): void {
    const world = frame.world, { x, y, cell } = layout.board;
    ctx.save(); ctx.translate(x, y);
    const draw = (slot: VisualSlot, px: number, py: number, age = 0, opacity = 1, context = ctx, size = cell) => {
      const visual = resolveVisual(this.theme, slot, age, settings.appearance);
      if (visual) { context.save(); context.globalAlpha = opacity; this.sprite(context, visual, px * size, py * size, size); context.restore(); }
    };
    if (!entities) {
      const key = `${settings.appearance}:${world.blockers.length}`;
      if (key !== this.terrainKey) {
        this.terrainKey = key; this.terrainContext.clearRect(0, 0, this.terrain.width, this.terrain.height);
        for (let row = 0; row < world.initialMap.height; row++) for (let col = 0; col < world.initialMap.width; col++) draw('terrain.floor', col + .5, row + .5, 0, 1, this.terrainContext, 64);
        for (const spawn of world.initialMap.spawns) draw('spawn.marker', spawn.x + .5, spawn.y + .5, 0, 1, this.terrainContext, 64);
        for (const wall of world.blockers) draw(wall.type === 'solid-wall' ? 'terrain.solid' : 'terrain.breakable', wall.x + .5, wall.y + .5, 0, 1, this.terrainContext, 64);
        draw('decoration.accent', .5, .5, 0, 1, this.terrainContext, 64);
      }
      drawImage(ctx, this.terrain, 0, 0, world.initialMap.width * cell, world.initialMap.height * cell);
      for (const item of world.items) draw(item.type, item.x + .5, item.y + .5, 0, item.active ? 1 : .4);
      for (const bomb of world.bombs) draw('bomb.idle', bomb.x + .5, bomb.y + .5, (world.tick - bomb.placedAtTick) / world.initialization.rules.tickRate);
      for (const hazard of world.hazards) for (const p of hazard.cells) draw('hazard.fire', p.x + .5, p.y + .5, (world.tick - hazard.createdAtTick) / world.initialization.rules.tickRate);
      for (const pose of this.poses) {
        const actor = world.actors.find(a => a.id === pose.id)!;
        const p = interpolatePosition(actor, world.result || !actor.alive ? 1 : frame.alpha);
        if (actor.alive) { ctx.strokeStyle = actorColors[world.actors.indexOf(actor)]!; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x * cell, (p.y + .28) * cell, cell * .35, cell * .13, 0, 0, Math.PI * 2); ctx.stroke(); }
        const visual = settings.reducedMotion ? { ...pose.visual, frame: pose.visual.frames[0]! } : pose.visual;
        this.sprite(ctx, visual, p.x * cell, p.y * cell, cell, visual.flipX);
      }
      this.drawEffects(ctx, cell, settings);
    } else {
      ctx.fillStyle = '#173737'; ctx.fillRect(0, 0, cell * world.initialMap.width, cell * world.initialMap.height);
      ctx.strokeStyle = '#3f625f'; ctx.lineWidth = .5;
      for (let row = 0; row < world.initialMap.height; row++) for (let col = 0; col < world.initialMap.width; col++) ctx.strokeRect(col * cell, row * cell, cell, cell);
      ctx.strokeStyle = '#a8e1d8'; ctx.lineWidth = 2;
      for (const spawn of world.initialMap.spawns) ctx.strokeRect((spawn.x + .2) * cell, (spawn.y + .2) * cell, cell * .6, cell * .6);
      for (const wall of world.blockers) { ctx.fillStyle = wall.type === 'solid-wall' ? '#79958c' : '#c79d64'; ctx.fillRect((wall.x + .06) * cell, (wall.y + .06) * cell, cell * .88, cell * .88); }
      for (const item of world.items) {
        ctx.fillStyle = '#f1ca7c'; ctx.fillRect((item.x + .15) * cell, (item.y + .15) * cell, cell * .7, cell * .7);
        ctx.fillStyle = '#173737'; ctx.font = `bold ${Math.max(9, cell * .4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(item.type === 'item.capacity' ? '容' : item.type === 'item.range' ? '距' : '速', (item.x + .5) * cell, (item.y + .5) * cell);
      }
      for (const bomb of world.bombs) { ctx.fillStyle = '#172e36'; ctx.strokeStyle = '#f1ca7c'; ctx.beginPath(); ctx.arc((bomb.x + .5) * cell, (bomb.y + .5) * cell, cell * .35, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      for (const hazard of world.hazards) for (const p of hazard.cells) { ctx.fillStyle = '#f48d50'; ctx.fillRect(p.x * cell, p.y * cell, cell, cell); }
      for (const actor of world.actors) if (actor.alive) { const p = interpolatePosition(actor, frame.alpha); ctx.fillStyle = actorColors[world.actors.indexOf(actor)]!; ctx.beginPath(); ctx.arc(p.x * cell, p.y * cell, cell * .3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  private drawEffects(ctx: CanvasRenderingContext2D, cell: number, settings: Readonly<Settings>): void {
    for (const d of this.effects.danger) {
      const x = (d.position.x + .5) * cell, y = (d.position.y + .5) * cell;
      ctx.strokeStyle = '#fff2bc'; ctx.lineWidth = Math.max(1, cell / 32); ctx.strokeRect(x - cell * .43, y - cell * .43, cell * .86, cell * .86);
      for (const direction of d.connections) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (direction === 'left' ? -.4 : direction === 'right' ? .4 : 0) * cell, y + (direction === 'up' ? -.4 : direction === 'down' ? .4 : 0) * cell); ctx.stroke(); }
    }
    for (const effect of this.effects.effects) {
      const p = Math.min(1, effect.ageMs / effect.durationMs), x = effect.position.x * cell, y = effect.position.y * cell;
      ctx.save(); ctx.globalAlpha = (1 - p) ** 2;
      const fire = this.effects.danger.some(d => d.position.x === Math.floor(effect.position.x) && d.position.y === Math.floor(effect.position.y));
      if (effect.kind !== 'explosion' || fire) {
        ctx.strokeStyle = effect.kind === 'explosion' ? '#fff2bc' : '#83dfb6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, cell * (settings.reducedMotion ? .35 : .2 + p * .3), 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < effect.particles; i++) {
        const angle = i * 2.399963, r = cell * (.15 + p * (.2 + i % 4 * .06));
        ctx.fillStyle = ['#d6b7de', '#e4cf9e', '#bbd7d5'][i % 3]!;
        ctx.fillRect(x + Math.cos(angle) * r - 1, y + Math.sin(angle) * r - 1 + p * p * cell * .15, 2, 2);
      }
      ctx.restore();
    }
  }
  dispose(): void { this.feedback.dispose(); this.terrain.width = 1; this.terrain.height = 1; }
}
