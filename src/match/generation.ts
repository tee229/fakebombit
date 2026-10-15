import type { ActorState, Blocker, Direction, MatchRules, Position, SemanticMap } from './index.js';
import { MatchError } from './errors.js';
import { createGameplayRandom } from './arbitration.js';
import { findEscape } from './escape-ai.js';
import { adjacentPassage } from './queries.js';
import { makeBomb } from './bomb.js';
import { freeze } from './immutable.js';

export interface GeneratorConfig {
  readonly width: number;
  readonly height: number;
  readonly blockerChance: number;
  readonly maxAttempts: number;
  readonly maxSearchStates: number;
  readonly searchHorizonSeconds: number;
}
export const generatorDefaults: GeneratorConfig = { width: 17, height: 15, blockerChance: 0.45, maxAttempts: 12, maxSearchStates: 6000, searchHorizonSeconds: 6 };
export interface SpawnSafety {
  readonly spawnId: string;
  readonly openDirections: number;
  readonly reachableCells: number;
  readonly nearbyCrates: number;
  readonly escape: readonly (Direction | null)[];
  readonly searchedStates: number;
}
export interface GenerationRecord {
  readonly config: GeneratorConfig;
  readonly source: 'random' | 'fallback';
  readonly attempts: readonly { readonly source: 'random' | 'fallback'; readonly failures: readonly string[] }[];
  readonly spawns: readonly SpawnSafety[];
}
export class MapGenerationError extends MatchError {
  readonly config: GeneratorConfig;
  readonly attempts: GenerationRecord['attempts'];
  constructor(config: GeneratorConfig, attempts: GenerationRecord['attempts']) {
    super('generation-failed', `No safe map after ${attempts.length - 1} random attempts and one validated base layout: ${attempts.at(-1)!.failures.join(', ')}`);
    this.name = 'MapGenerationError';
    this.config = freeze({ ...config });
    this.attempts = freeze([...attempts]);
  }
}
const directions: readonly Direction[] = ['up', 'right', 'down', 'left'];

function reachable(map: SemanticMap, start: Position, radius: number): Set<string> {
  const seen = new Set([`${start.x},${start.y}`]);
  const cells: Position[] = [start];
  for (let index = 0; index < cells.length; index++) for (const direction of directions) {
    const next = adjacentPassage(map, cells[index]!, direction, radius);
    if (!next || seen.has(`${next.x},${next.y}`)) continue;
    seen.add(`${next.x},${next.y}`); cells.push(next);
  }
  return seen;
}

function inspectCandidate(map: SemanticMap, rules: MatchRules, config: GeneratorConfig) {
  const failures: string[] = [];
  const spawns: SpawnSafety[] = [];
  const potential = reachable({ ...map, blockers: map.blockers.filter(wall => wall.type === 'solid-wall') }, map.spawns[0]!, rules.radius);
  if (map.spawns.some(spawn => !potential.has(`${spawn.x},${spawn.y}`))) failures.push('spawn-connectivity');
  for (const spawn of map.spawns) {
    const openDirections = directions.filter(direction => adjacentPassage(map, spawn, direction, rules.radius)).length;
    const reachableCells = reachable(map, spawn, rules.radius).size;
    const nearbyCrates = map.blockers.filter(wall => wall.type === 'breakable-wall' && Math.abs(wall.x - spawn.x) + Math.abs(wall.y - spawn.y) <= 4).length;
    const position = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    const actor: ActorState = { id: spawn.id, type: 'actor', position, previousPosition: position, heading: null, alive: true,
      abilities: { speed: rules.speed, bombCapacity: rules.bombCapacity, blastRange: rules.blastRange } };
    const bomb = makeBomb('spawn-probe', actor, 0, rules, [actor.id]);
    const route = findEscape({ tick: 0, initialMap: map, blockers: map.blockers, bombs: [bomb], hazards: [], result: null, initialization: { rules } }, actor, config);
    if (openDirections < 2 || reachableCells < 5) failures.push(`${spawn.id}:starting-space`);
    if (nearbyCrates < 1) failures.push(`${spawn.id}:nearby-resources`);
    if (route.status !== 'escaping') failures.push(`${spawn.id}:${route.status}`);
    spawns.push({ spawnId: spawn.id, openDirections, reachableCells, nearbyCrates, escape: route.plan, searchedStates: route.searchedStates });
  }
  if (new Set(spawns.map(spawn => spawn.nearbyCrates)).size !== 1) failures.push('unequal-resources');
  return { failures, spawns };
}

export function resolveGenerator(config: Partial<GeneratorConfig>): GeneratorConfig {
  if (config === null || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !Object.hasOwn(generatorDefaults, key))) throw new MatchError('invalid-config', 'Generator requires supported settings');
  const resolved = { ...generatorDefaults, ...config };
  for (const key of ['width', 'height'] as const) if (!Number.isSafeInteger(resolved[key]) || resolved[key] < 7 || resolved[key] > 25 || resolved[key] % 2 !== 1) {
    throw new MatchError('invalid-config', `${key} must be odd and between 7 and 25 cells`);
  }
  if (!Number.isFinite(resolved.blockerChance) || resolved.blockerChance < 0 || resolved.blockerChance > 1) throw new MatchError('invalid-config', 'blockerChance must be between 0 and 1');
  if (!Number.isSafeInteger(resolved.maxAttempts) || resolved.maxAttempts < 0) throw new MatchError('invalid-config', 'maxAttempts must be a nonnegative safe integer');
  if (!Number.isSafeInteger(resolved.maxSearchStates) || resolved.maxSearchStates <= 0) throw new MatchError('invalid-config', 'maxSearchStates must be positive');
  if (!Number.isFinite(resolved.searchHorizonSeconds) || resolved.searchHorizonSeconds <= 0) throw new MatchError('invalid-config', 'searchHorizonSeconds must be positive and finite');
  return resolved;
}

export function buildCandidate(config: GeneratorConfig, draw: (size: number) => number): SemanticMap {
  const { width, height } = config;
  const spawns = [{ id: 'player', x: 1, y: 1 }, { id: 'target-1', x: width - 2, y: 1 },
    { id: 'target-2', x: width - 2, y: height - 2 }, { id: 'target-3', x: 1, y: height - 2 }];
  const blockers: Blocker[] = [];
  const crates = new Set<string>();
  for (let y = 1; y <= (height - 1) / 2; y++) for (let x = 1; x <= (width - 1) / 2; x++) {
    if ((x % 2 === 0 && y % 2 === 0) || spawns.some(spawn => Math.abs(spawn.x - x) + Math.abs(spawn.y - y) <= 2)) continue;
    if (draw(4294967296) / 4294967296 >= config.blockerChance) continue;
    for (const mirrorX of [x, width - 1 - x]) for (const mirrorY of [y, height - 1 - y]) crates.add(`${mirrorX},${mirrorY}`);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || (x % 2 === 0 && y % 2 === 0)) blockers.push({ id: `wall-${x}-${y}`, type: 'solid-wall', x, y });
    else if (crates.has(`${x},${y}`)) blockers.push({ id: `crate-${x}-${y}`, type: 'breakable-wall', x, y });
  }
  return { width, height, ground: Array.from({ length: width * height }, () => 'floor'), blockers, spawns };
}

export function generateMap(seed: string, config: Partial<GeneratorConfig>, rules: MatchRules) {
  const resolved = resolveGenerator(config);
  if (!Number.isSafeInteger(Math.ceil(resolved.searchHorizonSeconds * rules.tickRate))) throw new MatchError('invalid-config', 'Generator horizon must resolve to safe ticks');
  const draw = createGameplayRandom(seed, 'map-generation');
  const attempts: GenerationRecord['attempts'][number][] = [];
  for (let attempt = 0; attempt <= resolved.maxAttempts; attempt++) {
    const source = attempt === resolved.maxAttempts ? 'fallback' as const : 'random' as const;
    let map = buildCandidate(source === 'fallback' ? { ...resolved, blockerChance: 0 } : resolved, draw);
    if (source === 'fallback') {
      const cells = new Set<string>();
      for (const x of [3, resolved.width - 4]) for (const y of [3, resolved.height - 4]) cells.add(`${x},${y}`);
      const crates: Blocker[] = [...cells].map(cell => { const [x, y] = cell.split(',').map(Number); return { id: `crate-${x}-${y}`, type: 'breakable-wall', x: x!, y: y! }; });
      map = { ...map, blockers: [...map.blockers, ...crates].sort((left, right) => left.y - right.y || left.x - right.x) };
    }
    const inspection = inspectCandidate(map, rules, resolved);
    attempts.push({ source, failures: inspection.failures });
    if (inspection.failures.length === 0) {
      const generation: GenerationRecord = { config: resolved, source, attempts, spawns: inspection.spawns };
      return { map, generation };
    }
  }
  throw new MapGenerationError(resolved, attempts);
}
