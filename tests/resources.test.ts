import { expect, test } from 'vitest';
import { createResourcePreparation, resolveVisual, visualSlotFor, type ThemePackage } from '../src/resources/index.js';
import { builtinThemes } from '../src/resources/builtin-themes.js';
import { createMatch } from '../src/match/index.js';
import { trainingMatchConfig } from '../src/browser/training-map.js';

const pose = { resource: 'tiles', frames: [0], framesPerSecond: 0, loop: false, facing: 'none' as const,
  referenceSize: { width: 64, height: 64 }, anchor: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } };
const theme: ThemePackage = { format: 'builtin-theme-v1', id: 'test-theme', label: '测试主题',
  resources: [{ id: 'tiles', url: '/assets/test.svg', width: 512, height: 192, frameWidth: 64, frameHeight: 64, required: true }],
  slots: { 'terrain.floor': pose, 'terrain.solid': pose, 'terrain.breakable': pose, 'spawn.marker': pose,
    'actor.player': pose, 'actor.opponent': pose, 'bomb.idle': pose, 'hazard.fire': pose,
    'item.capacity': pose, 'item.range': pose, 'item.speed': pose },
};

test('both appearance variants are prepared before play and shared images load only once', async () => {
  const loaded: string[] = [];
  const resources = createResourcePreparation(async resource => {
    loaded.push(resource.url);
    return { value: resource.url, width: resource.width, height: resource.height };
  });
  const source: ThemePackage = { ...theme,
    resources: [...theme.resources, { ...theme.resources[0]!, id: 'night', url: '/night.svg' }],
    appearances: { light: { slots: theme.slots }, dark: { slots: { ...theme.slots, 'terrain.floor': { ...pose, resource: 'night' } } } },
  };
  const result = await resources.start(source, ready => ({
    light: resolveVisual(ready, 'terrain.floor', 0, 'light')?.image.value,
    dark: resolveVisual(ready, 'terrain.floor', 0, 'dark')?.image.value,
    shared: resolveVisual(ready, 'bomb.idle', 0, 'dark')?.image.value,
  })).completion;
  expect(result).toEqual({ status: 'ready', value: { light: '/assets/test.svg', dark: '/night.svg', shared: '/assets/test.svg' } });
  expect(loaded).toEqual(['/assets/test.svg', '/night.svg']);
});

test('a required dark image failure blocks the match and a retry reuses the light image', async () => {
  const requests: string[] = []; let failDark = true, starts = 0;
  const resources = createResourcePreparation(async resource => {
    requests.push(resource.id);
    if (resource.id === 'night' && failDark) throw new Error('dark image unavailable');
    return { value: resource.id, width: resource.width, height: resource.height };
  });
  const source: ThemePackage = { ...theme,
    resources: [...theme.resources, { ...theme.resources[0]!, id: 'night', url: '/night.svg' }],
    appearances: { light: { slots: theme.slots }, dark: { slots: { ...theme.slots, 'bomb.idle': { ...pose, resource: 'night' } } } },
  };
  expect(await resources.start(source, () => ++starts).completion).toMatchObject({ status: 'failed', error: { code: 'load-failed' } });
  expect(starts).toBe(0);
  failDark = false;
  expect(await resources.start(source, () => ++starts).completion).toEqual({ status: 'ready', value: 1 });
  expect(requests).toEqual(['tiles', 'night', 'night']);
});

test('a variant cannot omit required slots or reference an optional image for gameplay objects', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  for (const dark of [{ slots: {} }, { slots: { ...theme.slots, 'terrain.floor': { ...pose, resource: 'decoration' } } }]) {
    const result = await resources.start({ ...theme,
      resources: [...theme.resources, { ...theme.resources[0]!, id: 'decoration', required: false }],
      appearances: { light: { slots: theme.slots }, dark },
    }, () => 'started').completion;
    expect(result).toMatchObject({ status: 'failed', error: { code: 'invalid-package' } });
  }
});

test('semantic objects resolve to explicit slots without requiring a texture or game engine', () => {
  const types = ['floor', 'solid-wall', 'breakable-wall', 'spawn', 'player', 'opponent', 'bomb', 'fire', 'item.capacity', 'item.range', 'item.speed'] as const;
  expect(types.map(visualSlotFor))
    .toEqual(['terrain.floor', 'terrain.solid', 'terrain.breakable', 'spawn.marker', 'actor.player', 'actor.opponent', 'bomb.idle', 'hazard.fire', 'item.capacity', 'item.range', 'item.speed']);
});

test('resource preparation starts a match only after the required image is decoded and validated', async () => {
  let finish!: (value: { value: string; width: number; height: number }) => void;
  const image = new Promise<{ value: string; width: number; height: number }>(resolve => { finish = resolve; });
  const resources = createResourcePreparation(async () => image);
  let started = false;
  const task = resources.start(theme, ready => { started = true; return ready.id; });
  await Promise.resolve();
  expect(started).toBe(false);
  finish({ value: 'decoded-image', width: 512, height: 192 });
  expect(await task.completion).toMatchObject({ status: 'ready', value: 'test-theme' });
  expect(started).toBe(true);
});

test('cancelling preparation completes immediately and a late image cannot start the old match', async () => {
  let finish!: (value: { value: string; width: number; height: number }) => void;
  const resources = createResourcePreparation(async () => new Promise<{ value: string; width: number; height: number }>(resolve => { finish = resolve; }));
  let started = false;
  const task = resources.start(theme, () => { started = true; });
  task.cancel();
  expect(await task.completion).toEqual({ status: 'cancelled' });
  finish({ value: 'late-image', width: 512, height: 192 });
  await Promise.resolve(); await Promise.resolve();
  expect(started).toBe(false);
});

test('a new preparation supersedes the previous identity and only the newest match can start', async () => {
  const finishes: ((value: { value: string; width: number; height: number }) => void)[] = [];
  const resources = createResourcePreparation(async () => new Promise<{ value: string; width: number; height: number }>(resolve => { finishes.push(resolve); }));
  const started: string[] = [];
  const old = resources.start(theme, () => { started.push('old'); });
  const next = resources.start({ ...theme, id: 'new-theme', resources: [{ ...theme.resources[0]!, url: '/new.svg' }] }, () => { started.push('new'); });
  expect(next.id).not.toBe(old.id);
  finishes[1]!({ value: 'new', width: 512, height: 192 });
  expect(await next.completion).toMatchObject({ status: 'ready' });
  finishes[0]!({ value: 'old', width: 512, height: 192 });
  expect(await old.completion).toEqual({ status: 'cancelled' });
  expect(started).toEqual(['new']);
});

test('retries reuse the application cache while a failed image can be retried', async () => {
  let requests = 0;
  const resources = createResourcePreparation(async () => {
    requests += 1;
    if (requests === 1) throw new Error('image unavailable');
    return { value: 'decoded', width: 512, height: 192 };
  });
  expect(await resources.start(theme, () => true).completion).toMatchObject({ status: 'failed', error: { code: 'load-failed' } });
  expect(await resources.start(theme, () => true).completion).toMatchObject({ status: 'ready' });
  expect(await resources.start(theme, () => true).completion).toMatchObject({ status: 'ready' });
  expect(requests).toBe(2);
});

test('a missing required hazard slot fails before loading or starting a match', async () => {
  const slots = { ...theme.slots };
  delete slots['hazard.fire'];
  let requests = 0, started = false;
  const resources = createResourcePreparation(async () => { requests += 1; return { value: 'image', width: 512, height: 192 }; });
  const result = await resources.start({ ...theme, slots }, () => { started = true; }).completion;
  expect(result).toMatchObject({ status: 'failed', error: { code: 'invalid-package', message: expect.stringContaining('hazard.fire') } });
  expect(requests).toBe(0);
  expect(started).toBe(false);
});

test('an optional decoration failure is diagnosed and omitted without blocking the match', async () => {
  const source: ThemePackage = { ...theme, resources: [...theme.resources, { ...theme.resources[0]!, id: 'flower', url: '/flower.svg', required: false }],
    slots: { ...theme.slots, 'decoration.accent': { ...pose, resource: 'flower' } } };
  const resources = createResourcePreparation(async resource => {
    if (resource.id === 'flower') throw new Error('decoration unavailable');
    return { value: 'tiles', width: 512, height: 192 };
  });
  const result = await resources.start(source, ready => ({ hasDecoration: !!ready.images.flower, diagnostics: ready.diagnostics })).completion;
  expect(result).toMatchObject({ status: 'ready', value: { hasDecoration: false, diagnostics: [{ resource: 'flower', message: expect.stringContaining('unavailable') }] } });
});

test.each([
  { ...pose, resource: 'missing' },
  { ...pose, frames: [24] },
  { ...pose, referenceSize: { width: 0, height: 64 } },
  { ...pose, anchor: { x: 2, y: 0.5 } },
  { ...pose, frames: [0, 1], framesPerSecond: 0 },
])('invalid required animation or placement metadata fails before creating a match: %j', definition => {
  const resources = createResourcePreparation(async () => ({ value: 'image', width: 512, height: 192 }));
  return expect(resources.start({ ...theme, slots: { ...theme.slots, 'bomb.idle': definition } }, () => true).completion)
    .resolves.toMatchObject({ status: 'failed', error: { code: 'invalid-package' } });
});

test('slot resolution selects real animation frames and preserves the declared visual anchor and offset', async () => {
  const resources = createResourcePreparation(async () => ({ value: 'decoded', width: 512, height: 192 }));
  const source: ThemePackage = { ...theme, slots: { ...theme.slots, 'bomb.idle': { ...pose, frames: [3, 4, 5, 6], framesPerSecond: 4, loop: true, anchor: { x: 0.5, y: 0.75 }, offset: { x: 2, y: -4 } } } };
  const task = resources.start(source, ready => [0, 0.5, 1].map(age => resolveVisual(ready, 'bomb.idle', age)));
  expect(await task.completion).toMatchObject({ status: 'ready', value: [
    { frame: 3, image: { value: 'decoded' }, anchor: { x: 0.5, y: 0.75 }, offset: { x: 2, y: -4 } },
    { frame: 5 }, { frame: 3 },
  ] });
});

test('preparation snapshots and freezes visual definitions without freezing caller-owned configuration', async () => {
  const source = structuredClone(theme);
  let finish!: (value: { value: string; width: number; height: number }) => void;
  const resources = createResourcePreparation(async () => new Promise<{ value: string; width: number; height: number }>(resolve => { finish = resolve; }));
  const task = resources.start(source, ready => ({ frame: resolveVisual(ready, 'bomb.idle')?.frame, frozen: Object.isFrozen(ready.package.slots['bomb.idle']?.frames) }));
  Reflect.set(source.slots['bomb.idle']!.frames, '0', 99);
  finish({ value: 'image', width: 512, height: 192 });
  expect(await task.completion).toMatchObject({ status: 'ready', value: { frame: 0, frozen: true } });
  expect(Object.isFrozen(source.slots['bomb.idle']?.frames)).toBe(false);
});

test('a cancelled preparation and its replacement share in-flight image IO without starting the old match', async () => {
  let requests = 0, oldStarted = false;
  let finish!: (value: { value: string; width: number; height: number }) => void;
  const resources = createResourcePreparation(async () => { requests += 1; return new Promise<{ value: string; width: number; height: number }>(resolve => { finish = resolve; }); });
  const old = resources.start(theme, () => { oldStarted = true; });
  old.cancel();
  const next = resources.start(theme, ready => resolveVisual(ready, 'actor.player')?.image.value);
  finish({ value: 'shared', width: 512, height: 192 });
  expect(await old.completion).toEqual({ status: 'cancelled' });
  expect(await next.completion).toEqual({ status: 'ready', value: 'shared' });
  expect(requests).toBe(1); expect(oldStarted).toBe(false);
});

test('a decoded image with wrong dimensions prevents match creation and is not cached as a success', async () => {
  let requests = 0, started = 0;
  const resources = createResourcePreparation(async () => ({ value: 'wrong image', width: ++requests === 1 ? 64 : 512, height: 192 }));
  expect(await resources.start(theme, () => { started += 1; }).completion).toMatchObject({ status: 'failed', error: { code: 'size-mismatch' } });
  expect(started).toBe(0);
  expect(await resources.start(theme, () => { started += 1; }).completion).toMatchObject({ status: 'ready' });
  expect(started).toBe(1); expect(requests).toBe(2);
});

test('optional visuals resolve to nothing after their resource fails, with a diagnostic retained', async () => {
  const resources = createResourcePreparation(async resource => {
    if (!resource.required) throw new Error('missing accent');
    return { value: resource.url, width: resource.width, height: resource.height };
  });
  expect(await resources.start(builtinThemes[0]!, ready => ({ accent: resolveVisual(ready, 'decoration.accent'), diagnostics: ready.diagnostics })).completion)
    .toMatchObject({ status: 'ready', value: { accent: null, diagnostics: [{ resource: 'accent' }] } });
});

test('both built-in themes have complete slots and identical worlds and events for the same initialization and intents', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const prepare = async (source: ThemePackage) => {
    const result = await resources.start(source, ready => ({ ready, match: createMatch({ ...trainingMatchConfig, rules: { blastRange: 2, itemDropChance: 1 } }) })).completion;
    if (result.status !== 'ready') throw new Error('Built-in preparation failed');
    return result.value;
  };
  const candy = await prepare(builtinThemes[0]!), factory = await prepare(builtinThemes[1]!);
  expect(resolveVisual(candy.ready, 'terrain.solid')?.image.value).not.toEqual(resolveVisual(factory.ready, 'terrain.solid')?.image.value);
  for (const ready of [candy.ready, factory.ready]) {
    expect(resolveVisual(ready, 'terrain.floor', 0, 'dark')?.image.value).not.toEqual(resolveVisual(ready, 'terrain.floor', 0, 'light')?.image.value);
  }
  const seen = new Set<string>();
  for (let tick = 0; tick < 250; tick++) {
    const move = tick < 10 ? 'up' : tick < 50 ? 'right' : null;
    const intents = [{ actorId: 'player', move, bomb: tick === 50 }] as const;
    const events = candy.match.advanceTick(intents);
    events.forEach(event => seen.add(event.type));
    expect(factory.match.advanceTick(intents)).toEqual(events);
    expect(factory.match.readWorld()).toEqual(candy.match.readWorld());
    for (const ready of [candy.ready, factory.ready]) for (const mode of ['light', 'dark'] as const) for (const type of ['floor', 'solid-wall', 'breakable-wall', 'spawn', 'player', 'opponent', 'bomb', 'fire', 'item.capacity', 'item.range', 'item.speed'] as const) expect(resolveVisual(ready, visualSlotFor(type), tick / 60, mode)).not.toBeNull();
  }
  expect([...seen]).toEqual(expect.arrayContaining(['bomb-placed', 'bomb-exploded', 'blocker-destroyed']));
});

