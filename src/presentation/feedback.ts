import type { Direction, GameplayEvent, Position, WorldState } from '../match/index.js';

export type FeedbackKind = 'explosion' | 'break' | 'pickup' | 'elimination';
export interface FeedbackEffect {
  readonly id: string; readonly kind: FeedbackKind; readonly position: Position;
  readonly ageMs: number; readonly durationMs: number; readonly particles: number;
  readonly actorId?: string; readonly label?: string;
}
export interface SoundCue { readonly kind: FeedbackKind; readonly volume: number }
export interface DangerCell { readonly position: Position; readonly connections: readonly Direction[] }
export interface FeedbackSettings { readonly volume: number; readonly particleBudget: number; readonly reducedMotion: boolean }

/** Run-owned presentation history. It reads rule facts and never advances the match. */
export function createFeedback(initial: WorldState, options: Partial<FeedbackSettings> = {}) {
  let cursor = { tick: -1, order: -1 };
  let effects: FeedbackEffect[] = [];
  let disposed = false;
  let settings: FeedbackSettings = { volume: .45, particleBudget: 96, reducedMotion: false };
  const configure = (patch: Partial<FeedbackSettings>) => {
    const next = { ...settings, ...patch };
    if (!Number.isFinite(next.volume) || next.volume < 0 || next.volume > 1) throw new RangeError('Volume must be in [0, 1]');
    if (!Number.isSafeInteger(next.particleBudget) || next.particleBudget < 0 || next.particleBudget > 256) throw new RangeError('Particle budget must be an integer in [0, 256]');
    settings = Object.freeze(next);
  };
  configure(options);
  return {
    configure,
    dispose() { disposed = true; effects = []; },
    present(world: WorldState, events: readonly GameplayEvent[], deltaMs: number, frame: { paused?: boolean; visible?: boolean } = {}) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Presentation delta must be finite and nonnegative');
      if (disposed) return { events: [], sounds: [], effects: [], danger: [] };
      if (frame.visible === false) effects = [];
      if (!frame.paused) effects = effects.map(effect => ({ ...effect, ageMs: effect.ageMs + deltaMs })).filter(effect => effect.ageMs < effect.durationMs);
      const accepted: GameplayEvent[] = [], sounds: SoundCue[] = [];
      for (const event of events) {
        if (event.tick < cursor.tick || (event.tick === cursor.tick && event.order <= cursor.order)) continue;
        cursor = { tick: event.tick, order: event.order }; accepted.push(event);
        if (frame.paused || frame.visible === false) continue;
        const kind = event.type === 'bomb-exploded' ? 'explosion' : event.type === 'actor-eliminated' ? 'elimination'
          : event.type === 'blocker-destroyed' ? 'break' : event.type === 'item-collected' ? 'pickup' : null;
        if (!kind) continue;
        const blocker = event.type === 'blocker-destroyed' ? initial.initialMap.blockers.find(blocker => blocker.id === event.blockerId) : undefined;
        const cell = event.type === 'bomb-exploded' ? event.cells[0] : blocker;
        const actor = event.type === 'actor-eliminated' || event.type === 'item-collected' ? world.actors.find(actor => actor.id === event.actorId) : undefined;
        const position = actor?.position ?? (cell ? { x: cell.x + .5, y: cell.y + .5 } : undefined);
        if (!position) continue;
        const labels = { 'item.capacity': ['容量', 'bombCapacity'], 'item.range': ['距离', 'blastRange'], 'item.speed': ['速度', 'speed'] } as const;
        const pickup = event.type === 'item-collected' ? labels[event.kind] : undefined;
        effects.push({ id: `${event.tick}:${event.order}`, kind, position, ageMs: 0,
          durationMs: kind === 'pickup' ? 1000 : kind === 'explosion' ? 240 : 450, particles: kind === 'break' ? 14 : 10,
          ...(actor ? { actorId: actor.id } : {}),
          ...(event.type === 'item-collected' && pickup ? { label: `${pickup[0]} ↑ ${Number(event.abilities[pickup[1]].toFixed(2))}` } : {}),
        });
        if (settings.volume > 0) sounds.push({ kind, volume: settings.volume });
      }
      const cells = new Map<string, Position>();
      for (const hazard of world.hazards) for (const cell of hazard.cells) cells.set(`${cell.x}:${cell.y}`, cell);
      const offsets: readonly [Direction, number, number][] = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
      const danger: DangerCell[] = [...cells.values()].map(position => ({ position,
        connections: offsets.filter(([, x, y]) => cells.has(`${position.x + x}:${position.y + y}`)).map(([direction]) => direction),
      }));
      effects = effects.slice(-32);
      let available = settings.reducedMotion ? 0 : settings.particleBudget;
      effects = effects.map(effect => { const particles = Math.min(available, effect.particles); available -= particles; return { ...effect, particles }; });
      const priorities = { elimination: 0, pickup: 1, explosion: 2, break: 3 };
      return { events: Object.freeze(accepted), sounds: Object.freeze(sounds.sort((a, b) => priorities[a.kind] - priorities[b.kind]).slice(0, 6)),
        effects: Object.freeze(effects.map(effect => Object.freeze(effect))), danger: Object.freeze(danger) };
    },
  };
}
