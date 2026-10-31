import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createMatch } from '../src/match/index.js';

// Desktop diagnostic only. This does not measure browser rendering or a phone.
const trace = process.argv.includes('--trace');
const requested = process.argv.find(value => value.startsWith('--seed='))?.slice(7);
const tickLimit = Number(process.argv.find(value => value.startsWith('--ticks='))?.slice(8) ?? 3600);
if (!Number.isSafeInteger(tickLimit) || tickLimit < 1 || tickLimit > 7200) throw new RangeError('--ticks must be an integer from 1 to 7200');
const seeds = requested ? [requested] : ['issue16-baseline-a', 'issue16-baseline-b', 'issue16-baseline-c'];
for (const seed of seeds) {
  const started = performance.now();
  const match = createMatch({ seed, generator: {}, playerId: 'player', actors: ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor', spawnId: id,
    ...(id === 'player' ? {} : { ai: { mode: 'normal' } }) })) });
  const creationMs = performance.now() - started, durations: number[] = [], hash = trace ? createHash('sha256') : undefined;
  let bombs = 0, hazardCells = 0, maxReportedSearchStates = 0;
  while (match.readWorld().tick < tickLimit && !match.readWorld().result) {
    const tickStart = performance.now(), events = match.advanceTick([]), world = match.readWorld();
    durations.push(performance.now() - tickStart);
    hash?.update(JSON.stringify([world, events]));
    bombs = Math.max(bombs, world.bombs.length);
    hazardCells = Math.max(hazardCells, world.hazards.reduce((sum, fire) => sum + fire.cells.length, 0));
    maxReportedSearchStates = Math.max(maxReportedSearchStates, ...world.actors.map(actor => actor.ai?.searchedStates ?? 0));
  }
  const sorted = durations.toSorted((a, b) => a - b), world = match.readWorld();
  process.stdout.write(JSON.stringify({ environment: `Node ${process.version} ${process.platform}/${process.arch}`, trace, seed,
    width: world.initialMap.width, height: world.initialMap.height, tickLimit, ticks: world.tick, outcome: world.result?.outcome ?? null,
    creationMs, meanStepMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95StepMs: sorted[Math.ceil(sorted.length * .95) - 1], maxStepMs: sorted.at(-1), bombs, hazardCells, maxReportedSearchStates,
    ...(hash ? { sha256: hash.digest('hex') } : {}) }) + '\n');
}
