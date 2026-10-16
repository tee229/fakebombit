import { expect, test } from 'vitest';
import { createResourcePreparation, resolveSkinAnimation, withSkin } from '../src/resources/index.js';
import { builtinThemes } from '../src/resources/builtin-themes.js';
import { builtinSkins } from '../src/resources/builtin-skins.js';
import { createSkinPlayback } from '../src/resources/skin-playback.js';
import { createMatch } from '../src/match/index.js';
import { trainingMatchConfig } from '../src/browser/training-map.js';

test('a selected skin prepares its own required atlas and resolves movement with foot placement independently of the theme', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const result = await resources.start(withSkin(builtinThemes[0]!, builtinSkins[0]!), ready => resolveSkinAnimation(ready, 'move', 'down', 0.25)).completion;
  expect(result).toMatchObject({ status: 'ready', value: {
    frame: 7, flipX: false, image: { value: './skins/mint-atlas.svg' },
    anchor: { x: 0.5, y: 0.8125 }, offset: { x: 0, y: 16 }, referenceSize: { width: 64, height: 64 },
  } });
});

test('missing directional animation rejects preparation before loading or starting a match', async () => {
  const skin = structuredClone(builtinSkins[0]!);
  Reflect.deleteProperty(skin.animations.move, 'up');
  let loaded = false, started = false;
  const resources = createResourcePreparation(async resource => { loaded = true; return { value: resource.url, width: resource.width, height: resource.height }; });
  const result = await resources.start(withSkin(builtinThemes[0]!, skin), () => { started = true; }).completion;
  expect(result).toMatchObject({ status: 'failed', error: { code: 'invalid-package' } });
  expect(loaded).toBe(false); expect(started).toBe(false);
});

test('skin playback follows actual movement, retains the last facing at rest and freezes on pause', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const result = await resources.start(withSkin(builtinThemes[0]!, builtinSkins[0]!), ready => ready).completion;
  if (result.status !== 'ready') throw new Error('Expected valid skin preparation');
  const match = createMatch(trainingMatchConfig), playback = createSkinPlayback(result.value);
  const read = () => playback.present(match.readWorld(), 100).find(actor => actor.id === 'player');
  expect(read()).toMatchObject({ action: 'idle', direction: 'down' });
  match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(read()).toMatchObject({ action: 'idle', direction: 'down' });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(read()).toMatchObject({ action: 'move', direction: 'right' });
  match.advanceTick([{ actorId: 'player', move: null }]);
  expect(read()).toMatchObject({ action: 'idle', direction: 'right', ageSeconds: 0 });
  const before = playback.present(match.readWorld(), 250);
  expect(playback.present(match.readWorld(), 30000, true)).toEqual(before);
});

test('elimination runs once after immediate game-over while survivors and gameplay stay frozen', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const result = await resources.start(withSkin(builtinThemes[0]!, builtinSkins[1]!), ready => ready).completion;
  if (result.status !== 'ready') throw new Error('Expected valid preparation');
  const match = createMatch({ ...trainingMatchConfig, rules: { bombFuseSeconds: 0.05 } });
  const playback = createSkinPlayback(result.value);
  playback.present(match.readWorld(), 0);
  for (let tick = 0; tick < 10 && !match.readWorld().result; tick++) {
    match.advanceTick([{ actorId: 'player', move: null, bomb: match.readWorld().tick === 0 }]);
    playback.present(match.readWorld(), 16);
  }
  const world = match.readWorld(), first = playback.present(world, 0);
  expect(world.result?.outcome).toBe('lost');
  expect(first.find(pose => pose.id === 'player')).toMatchObject({ action: 'eliminated', ageSeconds: 0, visual: { frame: 10 } });
  const midway = playback.present(world, 250);
  expect(midway.find(pose => pose.id === 'player')).toMatchObject({ visual: { frame: 13 } });
  expect(midway.find(pose => pose.id === 'target-2')).toEqual(first.find(pose => pose.id === 'target-2'));
  expect(playback.present(world, 50000, true)).toEqual(midway);
  expect(playback.present(world, 250).some(pose => pose.id === 'player')).toBe(false);
  expect(playback.present(world, 0).some(pose => pose.id === 'player')).toBe(false);
  expect(createSkinPlayback(result.value).present(world, 0).some(pose => pose.id === 'player')).toBe(false);
  expect(match.readWorld()).toEqual(world);
  expect(match.advanceTick([])).toEqual([]);
});

test.each([
  ['frames', [48]], ['frames', []], ['framesPerSecond', 0], ['framesPerSecond', Infinity],
  ['anchor', { x: 2, y: 0.5 }], ['referenceSize', { width: 0, height: 64 }],
  ['offset', { x: NaN, y: 0 }], ['flipX', 'yes'], ['loop', true], ['resource', 'atlas'],
])('invalid required skin animation %s prevents creation', async (field, value) => {
  const skin = structuredClone(builtinSkins[0]!);
  Reflect.set(skin.animations.eliminated.left, field, value);
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  expect(await resources.start(withSkin(builtinThemes[0]!, skin), () => true).completion)
    .toMatchObject({ status: 'failed', error: { code: 'invalid-package' } });
});

test('skin preparation snapshots clips without freezing author data and reuses decoded atlases on retry', async () => {
  const skin = structuredClone(builtinSkins[1]!);
  let requests = 0;
  const resources = createResourcePreparation(async resource => { requests++; return { value: resource.url, width: resource.width, height: resource.height }; });
  const task = resources.start(withSkin(builtinThemes[1]!, skin), ready => ready);
  Reflect.set(skin.animations.move.left.frames, '0', 47);
  const result = await task.completion;
  if (result.status !== 'ready') throw new Error('Expected valid preparation');
  expect(resolveSkinAnimation(result.value, 'move', 'left', 0)).toMatchObject({ frame: 20, flipX: true });
  expect(Object.isFrozen(result.value.package.skin?.animations.move.left.frames)).toBe(true);
  expect(Object.isFrozen(skin.animations.move.left.frames)).toBe(false);
  const loaded = requests;
  await resources.start(withSkin(builtinThemes[1]!, builtinSkins[1]!), ready => ready).completion;
  expect(requests).toBe(loaded);
});

test('a missing required skin atlas fails preparation and cannot start invisible gameplay', async () => {
  let started = false;
  const resources = createResourcePreparation(async resource => {
    if (resource.id.startsWith('skin:')) throw new Error('skin unavailable');
    return { value: resource.url, width: resource.width, height: resource.height };
  });
  expect(await resources.start(withSkin(builtinThemes[0]!, builtinSkins[1]!), () => { started = true; }).completion)
    .toMatchObject({ status: 'failed', error: { code: 'load-failed' } });
  expect(started).toBe(false);
});

test('cancelling while the skin atlas is pending prevents a late load from creating the old match', async () => {
  let releaseSkin!: () => void, reachedSkin!: () => void, started = false;
  const pendingSkin = new Promise<void>(resolve => { releaseSkin = resolve; });
  const loadingSkin = new Promise<void>(resolve => { reachedSkin = resolve; });
  const resources = createResourcePreparation(async resource => {
    if (resource.id.startsWith('skin:')) { reachedSkin(); await pendingSkin; }
    return { value: resource.url, width: resource.width, height: resource.height };
  });
  const task = resources.start(withSkin(builtinThemes[0]!, builtinSkins[0]!), () => { started = true; });
  await loadingSkin;
  task.cancel();
  expect(await task.completion).toEqual({ status: 'cancelled' });
  releaseSkin();
  const replacement = resources.start(withSkin(builtinThemes[0]!, builtinSkins[0]!), ready => ready.package.skin?.id);
  expect(await replacement.completion).toEqual({ status: 'ready', value: 'mint' });
  expect(started).toBe(false);
});

test('every theme and skin combination yields identical worlds and ordered events for the same inputs', async () => {
  const resources = createResourcePreparation(async resource => ({ value: resource.url, width: resource.width, height: resource.height }));
  const prepared = [];
  for (const theme of builtinThemes) for (const skin of builtinSkins) {
    const result = await resources.start(withSkin(theme, skin), ready => ({ ready, match: createMatch({ ...trainingMatchConfig, rules: { blastRange: 2, itemDropChance: 1 } }) })).completion;
    if (result.status !== 'ready') throw new Error('Expected valid combination');
    prepared.push(result.value);
  }
  const reference = prepared[0]!;
  const seen = new Set<string>();
  for (let tick = 0; tick < 250; tick++) {
    const intents = [{ actorId: 'player', move: tick < 20 ? 'down' : tick < 50 ? 'right' : null, bomb: tick === 50 }] as const;
    const events = reference.match.advanceTick(intents);
    events.forEach(event => seen.add(event.type));
    for (const entry of prepared.slice(1)) {
      expect(entry.match.advanceTick(intents)).toEqual(events);
      expect(entry.match.readWorld()).toEqual(reference.match.readWorld());
    }
  }
  expect([...seen]).toEqual(expect.arrayContaining(['bomb-placed', 'bomb-exploded', 'actor-eliminated', 'match-ended']));
  const poses = prepared.map(entry => resolveSkinAnimation(entry.ready, 'move', 'left', 0.25));
  expect(poses[0]?.image.value).not.toBe(poses[1]?.image.value);
  for (const entry of prepared) {
    expect(resolveSkinAnimation(entry.ready, 'idle', 'up', 0)).toMatchObject({ frame: 32, flipX: false });
    expect(resolveSkinAnimation(entry.ready, 'move', 'right', 0.5)).toMatchObject({ frame: 20, flipX: false });
    expect(resolveSkinAnimation(entry.ready, 'eliminated', 'left', 0.5)).toMatchObject({ frame: 31, flipX: true, finished: true });
  }
});
