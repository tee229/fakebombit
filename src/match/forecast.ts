import type { Blocker, BombState, Position } from './index.js';
import type { QueryWorld } from './queries.js';
import { calculateExplosions } from './explosions.js';
import { freeze } from './immutable.js';

export interface DangerWindow {
  readonly bombId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly cells: readonly Position[];
}
export interface ForecastExplosion {
  readonly bombId: string;
  readonly tick: number;
  readonly expiresAtTick: number;
  readonly cells: readonly Position[];
}
export interface DangerForecast {
  readonly fromTick: number;
  readonly untilTick: number;
  readonly windows: readonly DangerWindow[];
  readonly explosions: readonly ForecastExplosion[];
  readonly changes: readonly { readonly tick: number; readonly blockers: readonly Blocker[]; readonly bombs: readonly BombState[] }[];
}

/** No future intents, pickups, RNG or result arbitration: simulate only known explosion facts. */
export function forecastDanger(world: QueryWorld): DangerForecast {
  if (world.result) return freeze({ fromTick: world.tick, untilTick: world.tick, windows: [], explosions: [], changes: [{ tick: world.tick, blockers: [...world.blockers], bombs: [...world.bombs] }] });
  let tick = world.tick;
  let bombs = [...world.bombs];
  let blockers = [...world.blockers];
  let fire = world.hazards.map(hazard => ({ cells: hazard.cells, expiresAtTick: hazard.expiresAtTick }));
  const windows: DangerWindow[] = world.hazards.map(hazard => ({ bombId: hazard.bombId, startTick: hazard.createdAtTick, endTick: hazard.expiresAtTick, cells: hazard.cells }));
  const explosions: ForecastExplosion[] = [];
  const changes: DangerForecast['changes'][number][] = [{ tick, blockers, bombs }];
  while (bombs.length > 0) {
    const touchingFire = bombs.some(bomb => fire.some(hazard => hazard.cells.some(cell => cell.x === bomb.x && cell.y === bomb.y)));
    tick = touchingFire ? tick + 1 : Math.max(tick + 1, Math.min(...bombs.map(bomb => bomb.detonateAtTick)));
    const { exploded, destroyed } = calculateExplosions(tick, world.initialMap, blockers, bombs, fire.filter(hazard => hazard.expiresAtTick >= tick));
    fire = fire.filter(hazard => hazard.expiresAtTick > tick);
    for (const [bombId, cells] of [...exploded].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      const expiresAtTick = tick + Math.ceil(world.initialization.rules.fireDurationSeconds * world.initialization.rules.tickRate);
      explosions.push({ bombId, tick, expiresAtTick, cells });
      windows.push({ bombId, startTick: tick, endTick: expiresAtTick, cells });
      fire.push({ cells, expiresAtTick });
    }
    bombs = bombs.filter(bomb => !exploded.has(bomb.id));
    blockers = blockers.filter(wall => !destroyed.has(wall.id));
    changes.push({ tick, blockers, bombs });
  }
  return freeze({ fromTick: world.tick, untilTick: Math.max(world.tick, ...windows.map(interval => interval.endTick)), windows, explosions, changes });
}
