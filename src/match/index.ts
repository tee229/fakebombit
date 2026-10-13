import { createArbitrationRandom } from './arbitration.js';

export type Direction = 'up' | 'right' | 'down' | 'left';
export interface Position {
  readonly x: number;
  readonly y: number;
}
export interface Blocker extends Position {
  readonly id: string;
  readonly type: 'solid-wall' | 'breakable-wall';
}
export interface SemanticMap {
  readonly width: number;
  readonly height: number;
  readonly ground: readonly 'floor'[];
  readonly blockers: readonly Blocker[];
  readonly spawns: readonly (Position & { readonly id: string })[];
}
export interface ActorConfig { readonly id: string; readonly type: 'actor'; readonly spawnId: string }
export interface MovementRules {
  readonly tickRate: number;
  readonly speed: number;
  readonly radius: number;
  readonly turnBufferTicks: number;
  readonly turnTolerance: number;
}
export interface MatchRules extends MovementRules {
  readonly bombCapacity: number;
  readonly blastRange: number;
  readonly bombFuseSeconds: number;
  readonly fireDurationSeconds: number;
  readonly matchDurationSeconds: number;
}
export interface MatchConfig {
  readonly seed: string;
  readonly map: SemanticMap;
  readonly actors: readonly ActorConfig[];
  readonly playerId?: string;
  readonly rules?: Partial<MatchRules>;
  readonly versions?: InitializationRecord['versions'];
}
export interface GameplayIntent { readonly actorId: string; readonly move: Direction | null; readonly bomb?: boolean }
export interface BombState extends Position {
  readonly id: string;
  readonly type: 'bomb';
  readonly ownerId: string;
  readonly exitActorIds: readonly string[];
  readonly placedAtTick: number;
  readonly detonateAtTick: number;
}
export interface FireState {
  readonly id: string;
  readonly type: 'hazard.fire';
  readonly bombId: string;
  readonly cells: readonly Position[];
  readonly createdAtTick: number;
  readonly expiresAtTick: number;
}
export interface PlacementEvent {
  readonly type: 'bomb-placed';
  readonly tick: number;
  readonly order: number;
  readonly bombId: string;
  readonly actorId: string;
  readonly cell: Position;
}
export interface ExplosionEvent {
  readonly type: 'bomb-exploded';
  readonly tick: number;
  readonly order: number;
  readonly bombId: string;
  readonly hazardId: string;
  readonly cells: readonly Position[];
}
export interface BlockerDestroyedEvent {
  readonly type: 'blocker-destroyed';
  readonly tick: number;
  readonly order: number;
  readonly blockerId: string;
}
export interface EliminationEvent {
  readonly type: 'actor-eliminated';
  readonly tick: number;
  readonly order: number;
  readonly actorId: string;
  readonly hazardId: string;
}
export interface MatchResult { readonly outcome: 'won' | 'lost' | 'draw'; readonly tick: number }
export interface MatchEndedEvent {
  readonly type: 'match-ended';
  readonly tick: number;
  readonly order: number;
  readonly result: MatchResult;
}
export type GameplayEvent = PlacementEvent | ExplosionEvent | BlockerDestroyedEvent | EliminationEvent | MatchEndedEvent;
export interface ActorState {
  readonly id: string;
  readonly type: 'actor';
  readonly position: Position;
  readonly previousPosition: Position;
  readonly heading: Direction | null;
  readonly alive: boolean;
}
export interface InitializationRecord {
  readonly seed: string;
  readonly rules: MatchRules;
  readonly map: SemanticMap;
  readonly actors: readonly ActorConfig[];
  readonly playerId?: string;
  readonly versions: { readonly match: string; readonly map: string; readonly generator: string; readonly ai: string };
}
export interface WorldState {
  readonly tick: number;
  readonly initialization: InitializationRecord;
  readonly initialMap: SemanticMap;
  readonly blockers: readonly Blocker[];
  readonly actors: readonly ActorState[];
  readonly bombs: readonly BombState[];
  readonly hazards: readonly FireState[];
  readonly result: MatchResult | null;
}
export interface Match {
  advanceTick(intents?: readonly GameplayIntent[]): readonly GameplayEvent[];
  readWorld(): WorldState;
}
const defaults: MatchRules = {
  tickRate: 60, speed: 3, radius: 0.3, turnBufferTicks: 8, turnTolerance: 0.12,
  bombCapacity: 1, blastRange: 1, bombFuseSeconds: 3, fireDurationSeconds: 0.5, matchDurationSeconds: 120,
};
const versions = { match: 'chain-bombs-v1', map: 'fixed-map-v1', generator: 'none', ai: 'none' };
const vectors: Record<Direction, Position> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export function createMatch(config: MatchConfig): Match {
  validateConfig(config);
  validateMap(config.map, config.actors);
  if (config.actors.some(actor => config.map.blockers.some(wall => wall.id === actor.id))) throw new MatchError('invalid-config', 'Actor and blocker entity identities must be distinct');
  for (const actor of config.actors) {
    if (actor.type !== 'actor') throw new MatchError('unknown-entity-type', `Unknown actor type: ${String(actor.type)}`);
  }

  const rules = { ...defaults, ...config.rules };
  validateRules(rules);
  const map: SemanticMap = {
    width: config.map.width,
    height: config.map.height,
    ground: [...config.map.ground],
    blockers: config.map.blockers.map(wall => ({ id: wall.id, type: wall.type, x: wall.x, y: wall.y })),
    spawns: config.map.spawns.map(spawn => ({ id: spawn.id, x: spawn.x, y: spawn.y })),
  };
  const initialization: InitializationRecord = freeze({
    seed: config.seed,
    rules,
    map,
    actors: config.actors.map(actor => ({ id: actor.id, type: actor.type, spawnId: actor.spawnId })),
    ...(config.playerId === undefined ? {} : { playerId: config.playerId }),
    versions,
  });
  let tick = 0;
  let bombSequence = 0;
  let fireSequence = 0;
  let bombs: BombState[] = [];
  let hazards: FireState[] = [];
  let blockers = [...map.blockers];
  let result: MatchResult | null = null;
  const chooseIndex = createArbitrationRandom(initialization.seed);
  const entityIds = new Set([...map.blockers.map(wall => wall.id), ...config.actors.map(actor => actor.id)]);
  const pending = new Map<string, { direction: Direction; expires: number }>();
  let actors: ActorState[] = config.actors.map(actor => {
    const spawn = map.spawns.find(spawn => spawn.id === actor.spawnId)!;
    const position = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    return { id: actor.id, type: 'actor', position, previousPosition: position, heading: null, alive: true };
  });
  return {
    advanceTick(intents = []) {
      if (result) return freeze([]);
      validateIntents(intents, actors);
      const events: GameplayEvent[] = [];
      const damage = new Map<string, string>();
      const requests = actors.filter(actor => actor.alive && intents.some(intent => intent.actorId === actor.id && intent.bomb)
        && bombs.filter(bomb => bomb.ownerId === actor.id).length < rules.bombCapacity
        && !bombs.some(bomb => bomb.x === Math.floor(actor.position.x) && bomb.y === Math.floor(actor.position.y)))
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      const groups = new Map<string, { cell: Position; candidates: ActorState[] }>();
      for (const actor of requests) {
        const cell = { x: Math.floor(actor.position.x), y: Math.floor(actor.position.y) };
        const key = `${cell.x},${cell.y}`;
        const group = groups.get(key) ?? { cell, candidates: [] };
        group.candidates.push(actor);
        groups.set(key, group);
      }
      for (const { cell, candidates } of [...groups.values()].sort((left, right) => left.cell.y - right.cell.y || left.cell.x - right.cell.x)) {
        const actor = candidates[candidates.length === 1 ? 0 : chooseIndex(candidates.length)]!;
        let id: string;
        do { id = `bomb-${++bombSequence}`; } while (entityIds.has(id));
        entityIds.add(id);
        const exitActorIds = actors.filter(other => other.alive && overlapsCell(other.position, cell, rules.radius)).map(other => other.id).sort();
        bombs = [...bombs, { id, type: 'bomb', ownerId: actor.id, ...cell, exitActorIds,
          placedAtTick: tick, detonateAtTick: tick + Math.ceil(rules.bombFuseSeconds * rules.tickRate) }];
        events.push({ type: 'bomb-placed', tick: tick + 1, order: events.length, bombId: id, actorId: actor.id, cell });
      }
      // Fire active at tick start can ignite a bomb even if it expires at this step's end.
      const burning = new Set(bombs.filter(bomb => hazards.some(hazard => hazard.cells.some(cell => cell.x === bomb.x && cell.y === bomb.y))).map(bomb => bomb.id));
      actors = actors.map(actor => {
        if (!actor.alive) return { ...actor, previousPosition: actor.position };
        const intent = intents.find(intent => intent.actorId === actor.id);
        if (intent?.move === null) pending.delete(actor.id);
        if (intent?.move) pending.set(actor.id, { direction: intent.move, expires: tick + rules.turnBufferTicks });
        const request = pending.get(actor.id);
        if (request && tick > request.expires) pending.delete(actor.id);
        const wanted = pending.get(actor.id)?.direction;
        if (!wanted) return { ...actor, previousPosition: actor.position, heading: null };
        const collisionMap = { ...map, blockers: [...blockers, ...bombs.filter(bomb => !bomb.exitActorIds.includes(actor.id))] };
        const moved = moveActor(actor, wanted, rules, collisionMap);
        const hazard = hazards.find(hazard => hazard.cells.some(cell => pathTouchesCell(moved.path, cell, rules.radius)));
        if (hazard) damage.set(actor.id, hazard.id);
        bombs = bombs.map(bomb => ({ ...bomb, exitActorIds: bomb.exitActorIds.filter(id => id !== actor.id || overlapsCell(moved.position, bomb, rules.radius)) }));
        if (moved.heading === wanted) pending.delete(actor.id);
        return { ...actor, position: moved.position, heading: moved.heading, previousPosition: actor.position };
      });
      tick += 1;
      hazards = hazards.filter(hazard => hazard.expiresAtTick > tick);
      const scheduled = new Set(bombs.filter(bomb => bomb.detonateAtTick <= tick || burning.has(bomb.id)).map(bomb => bomb.id));
      const exploded = new Map<string, Position[]>();
      const destroyed = new Set<string>();
      while (scheduled.size > 0) {
        const bombId = [...scheduled].sort()[0]!;
        scheduled.delete(bombId);
        if (exploded.has(bombId)) continue;
        const bomb = bombs.find(bomb => bomb.id === bombId)!;
        const cells: Position[] = [{ x: bomb.x, y: bomb.y }];
        for (const vector of Object.values(vectors)) {
          for (let distance = 1; distance <= rules.blastRange; distance++) {
            const cell = { x: bomb.x + vector.x * distance, y: bomb.y + vector.y * distance };
            if (cell.x < 0 || cell.x >= map.width || cell.y < 0 || cell.y >= map.height) break;
            const wall = blockers.find(wall => wall.x === cell.x && wall.y === cell.y);
            if (wall?.type === 'solid-wall') break;
            cells.push(cell);
            if (wall) { destroyed.add(wall.id); break; }
          }
        }
        exploded.set(bomb.id, cells);
        for (const other of bombs) {
          if (!exploded.has(other.id) && cells.some(cell => cell.x === other.x && cell.y === other.y)) scheduled.add(other.id);
        }
      }
      for (const [bombId, cells] of [...exploded].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
        let id: string;
        do { id = `fire-${++fireSequence}`; } while (entityIds.has(id));
        entityIds.add(id);
        hazards = [...hazards, { id, type: 'hazard.fire', bombId, cells,
          createdAtTick: tick, expiresAtTick: tick + Math.ceil(rules.fireDurationSeconds * rules.tickRate) }];
        events.push({ type: 'bomb-exploded', tick, order: events.length, bombId, hazardId: id, cells });
      }
      bombs = bombs.filter(bomb => !exploded.has(bomb.id));
      for (const wall of blockers.filter(wall => destroyed.has(wall.id)).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) {
        events.push({ type: 'blocker-destroyed', tick, order: events.length, blockerId: wall.id });
      }
      blockers = blockers.filter(wall => !destroyed.has(wall.id));
      const eliminated: { actorId: string; hazardId: string }[] = [];
      actors = actors.map(actor => {
        if (!actor.alive) return actor;
        const hazardId = damage.get(actor.id)
          ?? hazards.find(hazard => hazard.cells.some(cell => overlapsCell(actor.position, cell, rules.radius)))?.id;
        if (!hazardId) return actor;
        pending.delete(actor.id);
        eliminated.push({ actorId: actor.id, hazardId });
        return { ...actor, alive: false, heading: null };
      });
      for (const elimination of eliminated.sort((left, right) => left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0)) {
        events.push({ type: 'actor-eliminated', tick, order: events.length, ...elimination });
      }
      if (initialization.playerId !== undefined) {
        const player = actors.find(actor => actor.id === initialization.playerId)!;
        const outcome = !player.alive ? 'lost'
          : actors.every(actor => actor.id === player.id || !actor.alive) ? 'won'
          : tick >= Math.ceil(rules.matchDurationSeconds * rules.tickRate) ? 'draw' : null;
        if (outcome) {
          result = { outcome, tick };
          events.push({ type: 'match-ended', tick, order: events.length, result });
        }
      }
      return freeze(events);
    },
    readWorld() { return freeze({ tick, initialization, initialMap: map, blockers, actors, bombs, hazards, result }); },
  };
}

type CollisionMap = Pick<SemanticMap, 'width' | 'height'> & { readonly blockers: readonly Position[] };

function overlapsCell(position: Position, cell: Position, radius: number): boolean {
  return position.x + radius > cell.x && position.x - radius < cell.x + 1
    && position.y + radius > cell.y && position.y - radius < cell.y + 1;
}

function pathTouchesCell(path: readonly Position[], cell: Position, radius: number): boolean {
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!;
    const end = path[index]!;
    if (Math.max(start.x, end.x) + radius > cell.x && Math.min(start.x, end.x) - radius < cell.x + 1
      && Math.max(start.y, end.y) + radius > cell.y && Math.min(start.y, end.y) - radius < cell.y + 1) return true;
  }
  return path.length === 1 && overlapsCell(path[0]!, cell, radius);
}

function moveAxis(position: Position, direction: Direction, distance: number, map: CollisionMap, radius: number): Position {
  const vector = vectors[direction];
  const axis = vector.x === 0 ? 'y' : 'x';
  const across = axis === 'x' ? 'y' : 'x';
  const sign = vector[axis];
  const start = position[axis];
  let end = Math.max(radius, Math.min((axis === 'x' ? map.width : map.height) - radius, start + sign * distance));
  for (const wall of map.blockers) {
    if (position[across] + radius <= wall[across] || position[across] - radius >= wall[across] + 1) continue;
    if (sign > 0 && start <= wall[axis] - radius) end = Math.min(end, wall[axis] - radius);
    if (sign < 0 && start >= wall[axis] + 1 + radius) end = Math.max(end, wall[axis] + 1 + radius);
  }
  return { ...position, [axis]: end };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

interface MovementOutcome { position: Position; heading: Direction | null; path: readonly Position[] }

function moveActor(actor: ActorState, wanted: Direction, rules: MovementRules, map: CollisionMap): MovementOutcome {
  const distance = rules.speed / rules.tickRate;
  const alignmentAxis = vectors[wanted].x === 0 ? 'x' : 'y';
  if (actor.heading && vectors[actor.heading][alignmentAxis] === 0) {
    const position = moveAxis(actor.position, wanted, distance, map, rules.radius);
    return { position, heading: wanted, path: [actor.position, position] };
  }
  const nearest = Math.floor(actor.position[alignmentAxis]) + 0.5;
  const snapDistance = Math.abs(nearest - actor.position[alignmentAxis]);
  const snapped = { ...actor.position, [alignmentAxis]: nearest };
  const snapDirection = alignmentAxis === 'x' ? (nearest >= actor.position.x ? 'right' : 'left') : (nearest >= actor.position.y ? 'down' : 'up');
  const snapEnd = moveAxis(actor.position, snapDirection, snapDistance, map, rules.radius);
  if (snapDistance <= rules.turnTolerance + 1e-10 && Math.abs(snapEnd[alignmentAxis] - nearest) <= 1e-10 && (!actor.heading || canTurn(snapped, wanted, map, rules.radius))) {
    const position = moveAxis(snapped, wanted, distance, map, rules.radius);
    return { position, heading: wanted, path: [actor.position, snapped, position] };
  }
  const heading = actor.heading;
  const sign = heading ? vectors[heading][alignmentAxis] : 0;
  let center = sign < 0 ? Math.floor(actor.position[alignmentAxis] - 0.5 + 1e-10) + 0.5 : Math.ceil(actor.position[alignmentAxis] - 0.5 - 1e-10) + 0.5;
  const limit = alignmentAxis === 'x' ? map.width : map.height;
  while (center > 0 && center < limit) {
    const travel = Math.abs(center - actor.position[alignmentAxis]);
    if (travel > distance + 1e-10 || (!heading && travel > 1e-10)) break;
    const aligned = { ...actor.position, [alignmentAxis]: center };
    const reached = heading ? moveAxis(actor.position, heading, travel, map, rules.radius) : actor.position;
    if (Math.abs(reached[alignmentAxis] - center) > 1e-10) break;
    if (canTurn(aligned, wanted, map, rules.radius)) {
      const position = moveAxis(aligned, wanted, Math.max(0, distance - travel), map, rules.radius);
      return { position, heading: wanted, path: [actor.position, aligned, position] };
    }
    if (!heading) break;
    center += sign;
  }
  const position = heading ? moveAxis(actor.position, heading, distance, map, rules.radius) : actor.position;
  return { position, heading, path: [actor.position, position] };
}

function canTurn(position: Position, direction: Direction, map: CollisionMap, radius: number): boolean {
  const vector = vectors[direction];
  const x = Math.floor(position.x) + vector.x;
  const y = Math.floor(position.y) + vector.y;
  return x >= 0 && x < map.width && y >= 0 && y < map.height
    && !map.blockers.some(wall => wall.x === x && wall.y === y)
    && !map.blockers.some(wall => position.x + radius > wall.x && position.x - radius < wall.x + 1 && position.y + radius > wall.y && position.y - radius < wall.y + 1);
}

export type MatchErrorCode = 'invalid-config' | 'unknown-entity-type' | 'invalid-map' | 'invalid-intent';
export class MatchError extends Error {
  constructor(readonly code: MatchErrorCode, message: string) {
    super(message);
    this.name = 'MatchError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validateConfig(config: unknown): void {
  if (!isRecord(config) || !nonempty(config.seed) || !Array.isArray(config.actors) || config.actors.length === 0) {
    throw new MatchError('invalid-config', 'A nonempty seed and actor configuration are required');
  }
  if (config.versions !== undefined && (!isRecord(config.versions) || Object.keys(config.versions).length !== Object.keys(versions).length
    || Object.entries(versions).some(([key, value]) => !isRecord(config.versions) || config.versions[key] !== value))) {
    throw new MatchError('invalid-config', 'Initialization requires incompatible implementation versions');
  }
  const actorIds = new Set<string>();
  for (const actor of config.actors) {
    if (!isRecord(actor) || !nonempty(actor.id) || !nonempty(actor.spawnId) || !nonempty(actor.type) || actorIds.has(actor.id)) {
      throw new MatchError('invalid-config', 'Actors require unique identities, entity types, and spawn references');
    }
    actorIds.add(actor.id);
  }
  if (Object.hasOwn(config, 'playerId') && (!nonempty(config.playerId) || !actorIds.has(config.playerId))) {
    throw new MatchError('invalid-config', 'playerId must identify a configured actor');
  }
  if (config.rules !== undefined && (!isRecord(config.rules) || Object.keys(config.rules).some(key => !Object.hasOwn(defaults, key)))) {
    throw new MatchError('invalid-config', 'Match rules must contain supported rule keys');
  }
}
function validateRules(rules: MatchRules): void {
  if (!Number.isSafeInteger(rules.tickRate) || rules.tickRate <= 0) throw new MatchError('invalid-config', 'tickRate must be a positive safe integer');
  if (!Number.isFinite(rules.speed) || rules.speed <= 0) throw new MatchError('invalid-config', 'speed must be positive and finite');
  if (!Number.isFinite(rules.radius) || rules.radius <= 0 || rules.radius >= 0.5) throw new MatchError('invalid-config', 'radius must be between 0 and 0.5 cells');
  if (!Number.isSafeInteger(rules.turnBufferTicks) || rules.turnBufferTicks < 0) throw new MatchError('invalid-config', 'turnBufferTicks must be a nonnegative safe integer');
  if (!Number.isFinite(rules.turnTolerance) || rules.turnTolerance < 0 || rules.turnTolerance >= 0.5) throw new MatchError('invalid-config', 'turnTolerance must be at least 0 and less than 0.5 cells');
  if (!Number.isSafeInteger(rules.bombCapacity) || rules.bombCapacity <= 0) throw new MatchError('invalid-config', 'bombCapacity must be a positive safe integer');
  if (!Number.isSafeInteger(rules.blastRange) || rules.blastRange <= 0) throw new MatchError('invalid-config', 'blastRange must be a positive safe integer');
  for (const key of ['bombFuseSeconds', 'fireDurationSeconds', 'matchDurationSeconds'] as const) {
    if (!Number.isFinite(rules[key]) || rules[key] <= 0) throw new MatchError('invalid-config', `${key} must be a positive finite number of seconds`);
    const ticks = Math.ceil(rules[key] * rules.tickRate);
    if (!Number.isSafeInteger(ticks) || ticks <= 0
      || !Number.isSafeInteger(ticks * 2)) throw new MatchError('invalid-config', `${key} must resolve to a positive, safely representable tick duration`);
  }
}

function validateMap(map: unknown, actors: readonly ActorConfig[]): void {
  function invalid(message: string): never { throw new MatchError('invalid-map', message); }
  if (!isRecord(map) || !Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height)
    || typeof map.width !== 'number' || typeof map.height !== 'number' || map.width <= 0 || map.height <= 0
    || !Number.isSafeInteger(map.width * map.height) || !Array.isArray(map.ground)
    || map.ground.length !== map.width * map.height || Array.from(map.ground).some(cell => cell !== 'floor')
    || !Array.isArray(map.blockers) || !Array.isArray(map.spawns)) invalid('Expected positive dimensions, row-major floor cells, blockers, and spawns');
  const width = map.width;
  const height = map.height;
  const cellIsValid = (cell: Record<string, unknown>) => typeof cell.x === 'number' && typeof cell.y === 'number'
    && Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y) && cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height;
  const identities = new Set<string>();
  const occupied = new Set<string>();
  for (const wall of map.blockers) {
    if (!isRecord(wall) || !nonempty(wall.id) || !cellIsValid(wall)) invalid('Blockers require an identity and an in-bounds integer cell');
    if (wall.type !== 'solid-wall' && wall.type !== 'breakable-wall') throw new MatchError('unknown-entity-type', `Unknown blocker type: ${String(wall.type)}`);
    const key = `${wall.x},${wall.y}`;
    if (identities.has(wall.id) || occupied.has(key)) invalid('Blocker identities and occupied cells must be unique');
    identities.add(wall.id);
    occupied.add(key);
  }
  const spawnIds = new Set<string>();
  for (const spawn of map.spawns) {
    if (!isRecord(spawn) || !nonempty(spawn.id) || !cellIsValid(spawn)) invalid('Spawns require an identity and an in-bounds integer cell');
    if (spawnIds.has(spawn.id) || occupied.has(`${spawn.x},${spawn.y}`)) invalid('Spawn identities must be unique and cells unblocked');
    spawnIds.add(spawn.id);
  }
  if (actors.some(actor => !spawnIds.has(actor.spawnId))) invalid('Every actor must reference an existing spawn');
}

function validateIntents(intents: unknown, actors: readonly ActorState[]): void {
  if (!Array.isArray(intents)) throw new MatchError('invalid-intent', 'Intents must be an array');
  const seen = new Set<string>();
  for (const intent of intents) {
    if (!isRecord(intent) || typeof intent.actorId !== 'string' || !actors.some(actor => actor.id === intent.actorId)
      || seen.has(intent.actorId) || (Object.hasOwn(intent, 'bomb') && typeof intent.bomb !== 'boolean')
      || (intent.move !== null && (typeof intent.move !== 'string' || !Object.hasOwn(vectors, intent.move)))) {
      throw new MatchError('invalid-intent', 'Each known actor may submit one cardinal move or explicit null release per tick');
    }
    seen.add(intent.actorId);
  }
}
