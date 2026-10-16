import { expect, test } from 'vitest';
import { createGameFlow } from '../src/game-flow/index.js';
import { createResourcePreparation } from '../src/resources/index.js';
import { builtinThemes } from '../src/resources/builtin-themes.js';
import { createMatch, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = {
  seed: 'complete-game-flow', playerId: 'player',
  map: { width: 12, height: 7, ground: Array.from({ length: 84 }, () => 'floor'), blockers: [],
    spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'other', x: 10, y: 5 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }, { id: 'other', type: 'actor', spawnId: 'other' }],
};

test('the menu prepares resources before entering a fresh playable run, and returning releases its input and presentation', async () => {
  let release!: () => void, mounted = 0, disposed = 0;
  const decoded = new Promise<void>(resolve => { release = resolve; });
  const resources = createResourcePreparation(async resource => {
    await decoded; return { value: resource.url, width: resource.width, height: resource.height };
  });
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch: () => {},
    mountRun: () => { mounted++; return { dispose: () => { disposed++; }, pause() {}, resume() {} }; },
  });
  expect(flow.read().phase).toBe('menu');
  const start = flow.start();
  expect(flow.read()).toMatchObject({ phase: 'preparing', run: null });
  expect(mounted).toBe(0);
  release(); await start;
  const run = flow.read().run!;
  expect(flow.read().phase).toBe('playing');
  run.input.keyDown('KeyD'); run.input.keyDown('Space');
  const playing = flow.advanceFrame(20).run!.frame;
  expect(playing.world.tick).toBe(1);
  expect(playing.events.map(event => event.type)).toEqual(['bomb-placed']);
  flow.returnToMenu();
  expect(flow.read()).toMatchObject({ phase: 'menu', run: null });
  expect(flow.advanceFrame(60000).run).toBeNull();
  expect(run.input.consumeIntent('player')).toEqual({ actorId: 'player', move: null, bomb: false });
  expect(mounted).toBe(1); expect(disposed).toBe(1);
});

test('preparation failure has no live run, and retry or return can recover without stale errors', async () => {
  let fail = true, mounted = 0;
  const resources = createResourcePreparation(async resource => {
    if (fail) throw new Error('offline'); return { value: resource.url, width: resource.width, height: resource.height };
  });
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!, makeMatch: () => createMatch(config), freshMatch() {},
    mountRun: () => { mounted++; return { dispose() {}, pause() {}, resume() {} }; },
  });
  await flow.start();
  expect(flow.read()).toMatchObject({ phase: 'failed', run: null, error: { code: 'load-failed', message: 'offline' } });
  expect(mounted).toBe(0);
  fail = false; await flow.retry();
  expect(flow.read()).toMatchObject({ phase: 'playing', error: null });
  expect(mounted).toBe(1);
  flow.returnToMenu(); expect(flow.read()).toMatchObject({ phase: 'menu', error: null });
});

test('the result is immediate and freezes gameplay without disposing short-lived presentation or repeating events', async () => {
  let disposed = 0;
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? { ...config, rules: { matchDurationSeconds: 1 / 60 } }), freshMatch() {},
    mountRun: () => ({ dispose() { disposed++; }, pause() {}, resume() {} }),
  });
  await flow.start();
  const end = flow.advanceFrame(100);
  expect(end).toMatchObject({ phase: 'result', run: { frame: { phase: 'ended', world: { tick: 1, result: { outcome: 'draw' } } } } });
  expect(end.run!.frame.events.map(event => event.type)).toEqual(['match-ended']);
  expect(flow.pause()).toBe(false); expect(flow.resume()).toBe(false);
  expect(flow.advanceFrame(60000).run!.frame).toMatchObject({ world: end.run!.frame.world, events: [], steps: 0 });
  expect(disposed).toBe(0);
  flow.returnToMenu(); expect(disposed).toBe(1);
});

test('an already terminal prepared match enters result immediately', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: () => { const match = createMatch({ ...config, rules: { matchDurationSeconds: 1 / 60 } }); match.advanceTick([]); return match; },
    freshMatch() {}, mountRun: () => ({ dispose() {}, pause() {}, resume() {} }),
  });
  await flow.start();
  expect(flow.read()).toMatchObject({ phase: 'result', run: { frame: { phase: 'ended' } } });
});

test('repeated starts, retries and returns keep one renderer alive at most and never retain old input', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const renderers = new Set<number>();
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch() {},
    mountRun: run => { renderers.add(run.id); return { dispose() { renderers.delete(run.id); }, pause() {}, resume() {} }; },
  });
  const ids = new Set<number>();
  for (let cycle = 0; cycle < 12; cycle++) {
    await flow.start(); const old = flow.read().run!; ids.add(old.id);
    old.input.keyDown('Space'); await flow.retry();
    expect(renderers.size).toBe(1);
    expect(flow.advanceFrame(20).run!.frame.events).toEqual([]);
    expect(old.input.consumeIntent('player')).toMatchObject({ move: null, bomb: false });
    flow.returnToMenu(); expect(renderers.size).toBe(0);
  }
  expect(ids.size).toBe(12);
});

test('entering background during preparation mounts a paused zero-tick run and requires manual resume', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const resources = createResourcePreparation(async resource => { await pending; return { value: resource.url, width: resource.width, height: resource.height }; });
  let paused = false;
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!, makeMatch: () => createMatch(config), freshMatch() {},
    mountRun: () => ({ dispose() {}, pause() { paused = true; }, resume() { paused = false; } }),
  });
  const start = flow.start(); flow.pause('background'); release(); await start;
  expect(flow.read()).toMatchObject({ phase: 'paused', run: { frame: { pauseReason: 'background', world: { tick: 0 } } } });
  expect(paused).toBe(true);
  expect(flow.advanceFrame(60000).run!.frame.world.tick).toBe(0);
  flow.resume();
  expect(flow.advanceFrame(60000).run!.frame.world.tick).toBe(0);
  expect(flow.advanceFrame(20).run!.frame.world.tick).toBe(1);
});

test('disposing is final, cancels preparation, and releases an active presentation exactly once', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  let mounted = 0, disposed = 0;
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch() {},
    mountRun: () => { mounted++; return { dispose() { disposed++; }, pause() {}, resume() {} }; },
  });
  await flow.start();
  flow.dispose(); flow.dispose(); flow.returnToMenu(); flow.newMatch();
  expect(flow.select(builtinThemes[1]!)).toBe(false);
  await flow.start(); await flow.retry();
  expect(flow.advanceFrame(1000)).toMatchObject({ phase: 'disposed', run: null });
  expect(mounted).toBe(1); expect(disposed).toBe(1);
  const pending = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: () => createMatch(config), freshMatch() {}, mountRun: () => { throw new Error('Late mount'); },
  });
  const start = pending.start(); pending.dispose(); await start;
  expect(pending.read()).toMatchObject({ phase: 'disposed', run: null, error: null });
});

test('new match releases the previous run, retains appearance and uses a fresh seed when started', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  let seed = config.seed, disposed = 0;
  const flow = createGameFlow({ resources, selection: builtinThemes[1]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? { ...config, seed }),
    freshMatch() { seed = 'new-seed'; }, mountRun: () => ({ dispose() { disposed++; }, pause() {}, resume() {} }),
  });
  await flow.start(); const old = flow.read().run!;
  flow.newMatch();
  expect(flow.read()).toMatchObject({ phase: 'menu', selection: { id: 'factory' }, run: null });
  await flow.start();
  expect(flow.read().run!.frame.world.initialization.seed).toBe('new-seed');
  expect(flow.read().run!.id).not.toBe(old.id); expect(disposed).toBe(1);
});

test('background pause clears input, freezes logic and presentation, then discards the first resumed frame', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  let paused = false;
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch() {},
    mountRun: () => ({ dispose() {}, pause() { paused = true; }, resume() { paused = false; } }),
  });
  await flow.start();
  flow.read().run!.input.keyDown('KeyD');
  const before = flow.advanceFrame(20).run!.frame.world;
  flow.pause('background');
  expect(flow.read()).toMatchObject({ phase: 'paused', run: { frame: { pauseReason: 'background' } } });
  expect(flow.advanceFrame(60000).run!.frame.world).toEqual(before); expect(paused).toBe(true);
  flow.read().run!.input.keyDown('Space');
  flow.resume(); expect(paused).toBe(false);
  expect(flow.advanceFrame(60000).run!.frame.world).toEqual(before);
  expect(flow.advanceFrame(20).run!.frame).toMatchObject({ events: [], steps: 1 });
  expect(flow.read().run!.frame.world.actors[0]?.position).toEqual(before.actors[0]?.position);
});

test('retry recreates complete initialization with a new input and presentation and reuses application images', async () => {
  let loads = 0, disposed = 0;
  const resources = createResourcePreparation(async resource => { loads++; return { value: resource.url, width: resource.width, height: resource.height }; });
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch() {},
    mountRun: () => ({ dispose: () => { disposed++; }, pause() {}, resume() {} }),
  });
  await flow.start();
  const original = flow.read().run!;
  const replay = () => {
    const samples = [];
    flow.read().run!.input.keyDown('KeyD'); flow.read().run!.input.keyDown('Space');
    for (let frame = 0; frame < 40; frame++) samples.push(flow.advanceFrame(20).run!.frame);
    return samples;
  };
  const expected = replay(), initialLoads = loads;
  await flow.retry();
  expect(flow.read().run!.id).not.toBe(original.id);
  expect(flow.read().run!.input).not.toBe(original.input);
  expect(flow.read().run!.frame.world.initialization).toEqual(original.frame.world.initialization);
  expect(replay()).toEqual(expected);
  expect(loads).toBe(initialLoads); expect(disposed).toBe(1);
});

test('returning during preparation and selecting a replacement cannot mount a late old run', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const resources = createResourcePreparation(async resource => {
    if (resource.url.includes('candy')) await pending;
    return { value: resource.url, width: resource.width, height: resource.height };
  });
  const mounted: string[] = [];
  const flow = createGameFlow({ resources, selection: builtinThemes[0]!,
    makeMatch: (_theme, initialization) => createMatch(initialization ?? config), freshMatch: () => {},
    mountRun: run => { mounted.push(run.theme.id); return { dispose() {}, pause() {}, resume() {} }; },
  });
  const old = flow.start();
  flow.returnToMenu();
  flow.select(builtinThemes[1]!);
  await flow.start();
  const current = flow.read().run;
  release(); await old;
  expect(flow.read()).toMatchObject({ phase: 'playing', selection: { id: 'factory' } });
  expect(flow.read().run).toBe(current);
  expect(mounted).toEqual(['factory']);
});
