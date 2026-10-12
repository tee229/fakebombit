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
export interface MatchConfig {
  readonly seed: string;
  readonly map: SemanticMap;
  readonly actors: readonly ActorConfig[];
  readonly rules?: Partial<MovementRules>;
  readonly versions?: InitializationRecord['versions'];
}
export interface GameplayIntent { readonly actorId: string; readonly move: Direction | null }
export interface ActorState {
  readonly id: string;
  readonly type: 'actor';
  readonly position: Position;
  readonly previousPosition: Position;
  readonly heading: Direction | null;
}
export interface InitializationRecord {
  readonly seed: string;
  readonly rules: MovementRules;
  readonly map: SemanticMap;
  readonly actors: readonly ActorConfig[];
  readonly versions: { readonly match: string; readonly map: string; readonly generator: string; readonly ai: string };
}
export interface WorldState {
  readonly tick: number;
  readonly initialization: InitializationRecord;
  readonly initialMap: SemanticMap;
  readonly blockers: readonly Blocker[];
  readonly actors: readonly ActorState[];
}
export interface Match {
  advanceTick(intents?: readonly GameplayIntent[]): readonly never[];
  readWorld(): WorldState;
}
const defaults: MovementRules = { tickRate: 60, speed: 3, radius: 0.3, turnBufferTicks: 8, turnTolerance: 0.12 };
const versions = { match: 'movement-v1', map: 'fixed-map-v1', generator: 'none', ai: 'none' };
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
    versions,
  });
  let tick = 0;
  const pending = new Map<string, { direction: Direction; expires: number }>();
  let actors: ActorState[] = config.actors.map(actor => {
    const spawn = map.spawns.find(spawn => spawn.id === actor.spawnId)!;
    const position = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    return { id: actor.id, type: 'actor', position, previousPosition: position, heading: null };
  });
  return {
    advanceTick(intents = []) {
      validateIntents(intents, actors);
      actors = actors.map(actor => {
        const intent = intents.find(intent => intent.actorId === actor.id);
        if (intent?.move === null) pending.delete(actor.id);
        if (intent?.move) pending.set(actor.id, { direction: intent.move, expires: tick + rules.turnBufferTicks });
        const request = pending.get(actor.id);
        if (request && tick > request.expires) pending.delete(actor.id);
        const wanted = pending.get(actor.id)?.direction;
        if (!wanted) return { ...actor, previousPosition: actor.position, heading: null };
        const moved = moveActor(actor, wanted, rules, map);
        if (moved.heading === wanted) pending.delete(actor.id);
        return { ...actor, ...moved, previousPosition: actor.position };
      });
      tick += 1;
      return [];
    },
    readWorld() { return freeze({ tick, initialization, initialMap: map, blockers: map.blockers, actors }); },
  };
}

function moveAxis(position: Position, direction: Direction, distance: number, map: SemanticMap, radius: number): Position {
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

function moveActor(actor: ActorState, wanted: Direction, rules: MovementRules, map: SemanticMap): { position: Position; heading: Direction | null } {
  const distance = rules.speed / rules.tickRate;
  const alignmentAxis = vectors[wanted].x === 0 ? 'x' : 'y';
  if (actor.heading && vectors[actor.heading][alignmentAxis] === 0) {
    return { position: moveAxis(actor.position, wanted, distance, map, rules.radius), heading: wanted };
  }
  const nearest = Math.floor(actor.position[alignmentAxis]) + 0.5;
  const snapDistance = Math.abs(nearest - actor.position[alignmentAxis]);
  const snapped = { ...actor.position, [alignmentAxis]: nearest };
  const snapDirection = alignmentAxis === 'x' ? (nearest >= actor.position.x ? 'right' : 'left') : (nearest >= actor.position.y ? 'down' : 'up');
  const snapEnd = moveAxis(actor.position, snapDirection, snapDistance, map, rules.radius);
  if (snapDistance <= rules.turnTolerance + 1e-10 && Math.abs(snapEnd[alignmentAxis] - nearest) <= 1e-10 && (!actor.heading || canTurn(snapped, wanted, map, rules.radius))) {
    return { position: moveAxis(snapped, wanted, distance, map, rules.radius), heading: wanted };
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
      return { position: moveAxis(aligned, wanted, Math.max(0, distance - travel), map, rules.radius), heading: wanted };
    }
    if (!heading) break;
    center += sign;
  }
  return { position: heading ? moveAxis(actor.position, heading, distance, map, rules.radius) : actor.position, heading };
}

function canTurn(position: Position, direction: Direction, map: SemanticMap, radius: number): boolean {
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
  if (config.rules !== undefined && (!isRecord(config.rules) || Object.keys(config.rules).some(key => !Object.hasOwn(defaults, key)))) {
    throw new MatchError('invalid-config', 'Movement rules must contain supported rule keys');
  }
}
function validateRules(rules: MovementRules): void {
  if (!Number.isSafeInteger(rules.tickRate) || rules.tickRate <= 0) throw new MatchError('invalid-config', 'tickRate must be a positive safe integer');
  if (!Number.isFinite(rules.speed) || rules.speed <= 0) throw new MatchError('invalid-config', 'speed must be positive and finite');
  if (!Number.isFinite(rules.radius) || rules.radius <= 0 || rules.radius >= 0.5) throw new MatchError('invalid-config', 'radius must be between 0 and 0.5 cells');
  if (!Number.isSafeInteger(rules.turnBufferTicks) || rules.turnBufferTicks < 0) throw new MatchError('invalid-config', 'turnBufferTicks must be a nonnegative safe integer');
  if (!Number.isFinite(rules.turnTolerance) || rules.turnTolerance < 0 || rules.turnTolerance >= 0.5) throw new MatchError('invalid-config', 'turnTolerance must be at least 0 and less than 0.5 cells');
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
      || seen.has(intent.actorId) || (intent.move !== null && (typeof intent.move !== 'string' || !Object.hasOwn(vectors, intent.move)))) {
      throw new MatchError('invalid-intent', 'Each known actor may submit one cardinal move or explicit null release per tick');
    }
    seen.add(intent.actorId);
  }
}
