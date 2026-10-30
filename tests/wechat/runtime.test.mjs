import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../../dist/match/index.js';

const root = resolve('dist/wechat');
const plain = value => JSON.parse(JSON.stringify(value));
async function launch(options = {}) {
  let now = 0, sequence = 0;
  const frames = new Map(), listeners = new Map(), storage = options.storage ?? new Map(), audio = [];
  const failedImages = new Set(options.failedImages ?? []), delayedImages = new Map();
  const logs = [], copies = [];
  let viewport = { windowWidth: 844, windowHeight: 390, screenWidth: 844, screenHeight: 390, pixelRatio: 2,
    safeArea: { left: 44, top: 0, right: 800, bottom: 370, width: 756, height: 370 }, ...options.viewport };
  const drawing = new Proxy({}, { get: (_target, name) => name === 'measureText' ? text => ({ width: text.length * 8 }) : () => {}, set: () => true });
  const wx = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => drawing }),
    createImage() {
      const image = { width: 0, height: 0, onload: () => {}, onerror: () => {} };
      Object.defineProperty(image, 'src', { set(path) {
        const load = () => {
          if (failedImages.has(path)) { image.onerror(); return; }
          const buffer = readFileSync(join(root, path));
          if (path.endsWith('.png')) { image.width = buffer.readUInt32BE(16); image.height = buffer.readUInt32BE(20); }
          else { image.width = 1280; image.height = 720; }
          image.onload();
        };
        if (options.delayImage === path) delayedImages.set(path, load); else queueMicrotask(load);
      } }); return image;
    },
    getStorageSync: key => { if (options.badStorage) throw Error('unavailable'); return storage.get(key); },
    setStorageSync: (key, value) => { if (options.badStorage) throw Error('unavailable'); storage.set(key, plain(value)); },
    getWindowInfo: () => viewport,
    getMenuButtonBoundingClientRect: () => ({ left: viewport.windowWidth - 100, top: 10, width: 90, height: 32 }),
    getPerformance: () => ({ now: () => now }),
    getDeviceInfo: () => ({ model: 'test host', platform: 'devtools', system: 'test' }),
    getAppBaseInfo: () => ({ SDKVersion: '3.17.6' }),
    getLaunchOptionsSync: () => ({ query: { acceptance: '1', seed: 'issue16-baseline-c', ...options.query } }),
    setPreferredFramesPerSecond: () => {},
    createInnerAudioContext() {
      const events = new Map(), item = { playing: false, destroyed: false, currentTime: 0, volume: 0, src: '', loop: false,
        play() { this.playing = true; events.get('Play')?.(); }, pause() { this.playing = false; events.get('Pause')?.(); },
        stop() { this.playing = false; this.currentTime = 0; events.get('Stop')?.(); }, destroy() { this.playing = false; this.destroyed = true; },
      };
      for (const event of ['Play', 'Pause', 'Stop', 'Error', 'Ended']) item[`on${event}`] = callback => events.set(event, callback);
      audio.push(item); return item;
    },
    setClipboardData: option => { copies.push(option.data); option.success?.(); },
  };
  for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize', 'AudioInterruptionBegin', 'AudioInterruptionEnd', 'KeyDown', 'KeyUp', 'Error', 'UnhandledRejection']) wx[`on${event}`] = callback => listeners.set(event, callback);
  const context = createContext({ wx, GameGlobal: {}, setTimeout, clearTimeout, queueMicrotask,
    console: { info: (...args) => logs.push(args), error: (...args) => logs.push(args), log: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; }, cancelAnimationFrame: id => frames.delete(id),
  });
  runInContext(readFileSync(join(root, 'game.js'), 'utf8'), context);
  const read = () => plain(context.GameGlobal.fakebombit.read());
  const step = (count = 1, delta = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      now += delta; for (const item of audio) if (item.playing) item.currentTime += delta / 1000;
      const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(now);
    }
  };
  const settle = async () => { for (let i = 0; i < 3; i++) { await setImmediate(); step(); } };
  const touch = (type, id, x, y) => listeners.get(type)?.({ changedTouches: [{ identifier: id, clientX: x, clientY: y }], touches: [], timeStamp: now });
  const widget = id => { const result = read().widgets.find(w => w.id === id && !w.disabled); assert.ok(result, `widget ${id} available`); return result.rect; };
  const tap = async id => { const r = widget(id), x = r.x + r.width / 2, y = r.y + r.height / 2; touch('TouchStart', 99, x, y); step(); touch('TouchEnd', 99, x, y); await settle(); };
  const key = async code => { listeners.get('KeyDown')?.({ code, key: code, timeStamp: now }); listeners.get('KeyUp')?.({ code, key: code, timeStamp: now }); await settle(); };
  await settle();
  return { read, step, settle, touch, tap, key, widget, storage, audio, logs, copies, failedImages, delayedImages,
    event: (name, data = {}) => listeners.get(name)?.(data), resize: value => { viewport = value; listeners.get('WindowResize')?.({}); },
  };
}

test('generated package is bounded, sources and generated assets have verifiable provenance', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'asset-manifest.json')));
  for (const asset of manifest.assets) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, asset.output))).digest('hex'), asset.outputSha256);
    assert.equal(createHash('sha256').update(readFileSync(asset.source)).digest('hex'), asset.sourceSha256);
  }
  const total = directory => readdirSync(directory, { withFileTypes: true }).reduce((sum, f) => sum + (f.isDirectory() ? total(join(directory, f.name)) : readFileSync(join(directory, f.name)).length), 0);
  assert.ok(total(root) < 4 * 1024 * 1024);
  assert.doesNotMatch(readFileSync(join(root, 'game.js'), 'utf8'), /document\.createElement|localStorage|from ['"]phaser|mcpServers|--token=/);
});

test('native host uses identical headless rules and can retry, choose skins/themes and create a new seed', async () => {
  const app = await launch(); assert.equal(app.read().booting, false);
  await app.tap('theme-factory'); await app.tap('skin-coral'); await app.tap('start');
  let state = app.read(); assert.equal(state.phase, 'playing'); assert.equal(state.world.actors.length, 4); assert.equal(state.world.initialMap.width, 17);
  const match = createMatch(state.world.initialization);
  for (let tick = 0; tick < state.tick; tick++) match.advanceTick([{ actorId: 'player', move: null, bomb: false }]);
  assert.deepEqual(state.world, plain(match.readWorld()));
  const initialization = state.world.initialization, id = state.runId;
  await app.tap('pause'); await app.tap('retry'); state = app.read();
  assert.equal(state.runId, id + 1); assert.deepEqual(state.world.initialization, initialization);
  await app.tap('pause'); await app.tap('new-match'); assert.equal(app.read().phase, 'menu'); assert.notEqual(app.read().seed, initialization.seed);
  await app.tap('skin-mint'); await app.tap('theme-candy'); await app.tap('start'); assert.equal(app.read().skin, 'mint'); assert.equal(app.read().theme, 'candy');
});

for (const mode of ['fixed', 'floating']) test(`${mode}: right-finger release preserves left input, cancellation and background clear input`, async () => {
  const app = await launch({ storage: new Map([['fakebombit-controls-v1', { mode }]]) }); await app.tap('start');
  const l = app.read().layout, center = mode === 'fixed' ? l.joystick : { x: l.floating.x + l.floating.width / 2, y: l.floating.y + l.floating.height / 2 };
  app.touch('TouchStart', 1, center.x + (mode === 'fixed' ? 35 : 0), center.y); app.step();
  if (mode === 'floating') { assert.equal(app.read().touch.direction, null); app.touch('TouchMove', 1, center.x + 35, center.y); }
  app.step(2); const before = app.read().world.actors[0].position.x;
  app.touch('TouchStart', 2, l.bomb.x, l.bomb.y); app.step(); app.touch('TouchEnd', 2, l.bomb.x, l.bomb.y);
  assert.equal(app.read().touch.direction, 'right'); assert.equal(app.read().touch.bombHeld, false);
  app.step(5); assert.ok(app.read().world.actors[0].position.x > before);
  app.event('TouchCancel'); assert.equal(app.read().touch.direction, null); assert.equal(app.read().floatingCenter, null);
  app.touch('TouchStart', 1, center.x + 35, center.y); app.event('Hide'); const tick = app.read().tick;
  app.step(1, 30000); app.event('Show'); app.step(); assert.equal(app.read().tick, tick); assert.equal(app.read().phase, 'paused');
  assert.equal(app.read().touch.joystickActive, false); await app.tap('resume'); app.step(2);
  assert.ok(app.read().tick - tick < 8, 'resume never catches up 30 seconds');
});

test('settings pause, two audio channels persist, reset preserves audio/appearance and temporary geometry never rewrites preferences', async () => {
  const app = await launch(); await app.tap('start'); await app.tap('settings'); const tick = app.read().tick;
  await app.tap('tab-audio');
  for (const id of ['music-volume', 'sound-volume']) { const r = app.widget(id); app.touch('TouchStart', 3, r.x + 12, r.y + 38); app.touch('TouchEnd', 3, r.x + 12, r.y + 38); await app.settle(); }
  assert.equal(app.read().settings.musicVolume, 0); assert.equal(app.read().settings.volume, 0);
  assert.equal(app.read().audio.musicInstances, 1);
  await app.tap('tab-controls'); await app.tap('floating'); assert.equal(app.read().widgets.find(w => w.id === 'joystickLeft').disabled, true);
  await app.tap('fixed'); const r = app.widget('joystickLeft'); app.touch('TouchStart', 4, r.x + r.width - 12, r.y + 38); app.touch('TouchEnd', 4, r.x + r.width - 12, r.y + 38); await app.settle();
  assert.equal(app.read().settings.controls.joystickLeft, 240); assert.ok(app.read().layout.actual.joystickLeft < 240);
  app.resize({ windowWidth: 1200, windowHeight: 800, screenWidth: 1200, screenHeight: 800, pixelRatio: 2, safeArea: { left: 24, top: 20, right: 1176, bottom: 780, width: 1152, height: 760 } }); app.step();
  assert.equal(app.read().settings.controls.joystickLeft, 240);
  await app.tap('reset-controls'); assert.equal(app.read().settings.controls.joystickLeft, null); assert.equal(app.read().settings.musicVolume, 0);
  await app.tap('close-settings'); app.step(4); assert.equal(app.read().tick, tick); assert.equal(app.read().phase, 'paused');
  const reload = await launch({ storage: app.storage }); assert.equal(reload.read().settings.volume, 0); assert.equal(reload.read().settings.musicVolume, 0);
  const unavailable = await launch({ badStorage: true }); assert.equal(unavailable.read().phase, 'menu');
});

test('a real bomb ends the game immediately, retry owns fresh effects and music stays a single instance', async () => {
  const app = await launch(); await app.tap('start'); const l = app.read().layout;
  app.touch('TouchStart', 1, l.bomb.x, l.bomb.y); app.step(2); app.touch('TouchEnd', 1, l.bomb.x, l.bomb.y);
  for (let i = 0; i < 200 && app.read().phase === 'playing'; i++) app.step();
  assert.equal(app.read().phase, 'result'); assert.equal(app.read().world.result.outcome, 'lost'); const tick = app.read().tick;
  app.step(20); assert.equal(app.read().tick, tick); assert.ok(app.read().widgets.find(w => w.id === 'retry-main'));
  await app.tap('retry-main'); assert.equal(app.read().phase, 'playing'); assert.equal(app.read().audio.musicInstances, 1);
  assert.ok(app.audio.filter(a => !a.destroyed).length <= 7);
});

test('required image failures recover and cancelling preparation prevents an old load from starting a game', async () => {
  const path = 'themes/candy-dark-atlas.png';
  const failed = await launch({ failedImages: [path] }); await failed.tap('start'); assert.equal(failed.read().phase, 'failed'); assert.equal(failed.read().runId, null);
  failed.failedImages.delete(path); await failed.tap('prepare-retry'); assert.equal(failed.read().phase, 'playing');
  const slow = await launch({ delayImage: path }); await slow.tap('start'); assert.equal(slow.read().phase, 'preparing');
  await slow.tap('prepare-cancel'); slow.delayedImages.get(path)?.(); await slow.settle(); assert.equal(slow.read().phase, 'menu'); assert.equal(slow.read().runId, null);
});

test('native audio interruption waits for a new user action, including while in the menu', async () => {
  const app = await launch(); await app.tap('skin-coral'); assert.equal(app.read().audio.musicPlaying, true);
  app.event('AudioInterruptionBegin'); app.step(5); assert.equal(app.read().audio.musicPlaying, false);
  app.event('AudioInterruptionEnd'); app.step(5); assert.equal(app.read().audio.musicPlaying, false);
  await app.tap('skin-mint'); assert.equal(app.read().audio.musicPlaying, true);
});

test('phone and tablet layouts keep both right cards below the capsule-aware toolbar and thumb controls below cards', async () => {
  for (const [width, height] of [[844, 390], [750, 280], [1180, 820]]) {
    const app = await launch({ viewport: { windowWidth: width, windowHeight: height, screenWidth: width, screenHeight: height, pixelRatio: 2,
      safeArea: { left: 24, top: 0, right: width - 24, bottom: height - 20, width: width - 48, height: height - 20 } } });
    const l = app.read().layout;
    assert.ok(l.cardY >= l.toolbarY + 48, `${width}: card clears toolbar`);
    assert.ok(l.joystick.y - l.joystick.radius >= l.cardY + 2 * l.cardHeight + 6, `${width}: joystick clears cards`);
    assert.ok(l.bomb.y + l.bomb.radius <= l.safe.y + l.safe.height, `${width}: bomb inside safe area`);
    await app.tap('menu-settings');
    const done = app.widget('close-settings'), capsule = app.read().viewport.capsule;
    assert.ok(!capsule || done.y >= capsule.y + capsule.height || done.x + done.width <= capsule.x, `${width}: settings completion clears native capsule`);
  }
});

test('short settings remain closable and vertical swipes over a button scroll without toggling it', async () => {
  const app = await launch({ viewport: { windowWidth: 640, windowHeight: 280, screenWidth: 640, screenHeight: 280, pixelRatio: 2,
    safeArea: { left: 24, top: 0, right: 616, bottom: 260, width: 592, height: 260 } } });
  await app.tap('menu-settings'); app.widget('close-settings');
  await app.tap('tab-effects'); const r = app.widget('appearance-settings'), original = app.read().settings.appearance;
  app.touch('TouchStart', 8, r.x + 30, r.y + 25); app.touch('TouchMove', 8, r.x + 30, r.y - 50); app.touch('TouchEnd', 8, r.x + 30, r.y - 50); await app.settle();
  assert.equal(app.read().settings.appearance, original);
  const last = app.widget('reduced-motion'); assert.ok(last.height >= 44);
  await app.tap('reduced-motion'); assert.equal(app.read().settings.reducedMotion, true);
  await app.tap('close-settings'); assert.equal(app.read().settingsOpen, false);
});
