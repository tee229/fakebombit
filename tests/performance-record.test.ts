import { expect, test } from 'vitest';
import { createPerformanceRecord } from '../src/diagnostics/performance-record.js';

const frame = { tick: 0, active: true, intervalMs: 20, logicMs: 2, presentationMs: 3, steps: 1, droppedTimeMs: 0,
  counters: { particles: 20, sounds: 2, textures: 60, objects: 320, bombs: 2, hazardCells: 7, aiSearchStates: 100 } };

test('foreground frame statistics use elapsed time and exclude the first interval after entering play', () => {
  const record = createPerformanceRecord();
  for (let i = 0; i < 51; i++) record.sample(frame);
  expect(record.read()).toMatchObject({ frames: 50, foregroundMs: 1000, averageFps: 50, p95FrameMs: 20, maxFrameMs: 20,
    averageLogicMs: 2, averagePresentationMs: 3, longestSegmentMs: 1000, verdict: 'insufficient' });
});

test('pause, loading and resume intervals cannot count as stutters or continuous play', () => {
  const record = createPerformanceRecord();
  for (let i = 0; i < 1001; i++) record.sample(frame);
  record.sample({ ...frame, active: false, intervalMs: 60000 });
  record.sample({ ...frame, intervalMs: 60000 });
  for (let i = 0; i < 2000; i++) record.sample(frame);
  expect(record.read()).toMatchObject({ frames: 3000, foregroundMs: 60000, longestSegmentMs: 40000, maxFrameMs: 20,
    excludedBoundaries: 2, verdict: 'insufficient' });
});

test('a full minute meets the agreed criteria, while slow intervals and a single severe stutter fail them', () => {
  const smooth = createPerformanceRecord();
  for (let i = 0; i < 3751; i++) smooth.sample({ ...frame, intervalMs: 16 });
  expect(smooth.read()).toMatchObject({ averageFps: 62.5, p95FrameMs: 16, verdict: 'pass', stuttersOver200Ms: 0 });
  smooth.sample({ ...frame, intervalMs: 201 });
  expect(smooth.read()).toMatchObject({ verdict: 'fail', stuttersOver200Ms: 1, maxFrameMs: 201 });
  const slow = createPerformanceRecord();
  for (let i = 0; i < 1501; i++) slow.sample({ ...frame, intervalMs: 40 });
  expect(slow.read()).toMatchObject({ averageFps: 25, p95FrameMs: 40, verdict: 'fail' });
});

test('budget peaks, dropped game time and invalid values are reported without altering samples', () => {
  const record = createPerformanceRecord(); record.sample(frame);
  record.sample({ ...frame, steps: 5, droppedTimeMs: 900 });
  record.sample({ ...frame, counters: { ...frame.counters, particles: 96, aiSearchStates: 6000 }, logicMs: 10 });
  expect(record.read()).toMatchObject({ maxSteps: 5, droppedTimeMs: 900, maxLogicMs: 10, peaks: { particles: 96, aiSearchStates: 6000 } });
  const before = record.read();
  expect(() => record.sample({ ...frame, intervalMs: NaN })).toThrow(RangeError);
  expect(record.read()).toEqual(before);
  expect(frame.counters.particles).toBe(20);
});

test('a faster short segment cannot turn a failing continuous minute into a pass', () => {
  const record = createPerformanceRecord(); record.sample(frame);
  for (let i = 0; i < 3241; i++) record.sample({ ...frame, intervalMs: 1000 / 54 });
  expect(record.read().verdict).toBe('fail');
  record.sample({ ...frame, active: false }); record.sample(frame);
  for (let i = 0; i < 1201; i++) record.sample({ ...frame, intervalMs: 1000 / 60 });
  expect(record.read().averageFps).toBeGreaterThan(55);
  expect(record.read().verdict).toBe('fail');
  expect(record.read().qualification.averageFps).toBeCloseTo(54);
  record.sample({ ...frame, active: false });
  expect(record.read().qualification.averageFps).toBeCloseTo(54);
  record.sample(frame);
  for (let i = 0; i < 3602; i++) record.sample({ ...frame, intervalMs: 1000 / 60 });
  expect(record.read().qualification.averageFps).toBeCloseTo(60);
  expect(record.read().verdict).toBe('pass');
});

test('percentiles use nearest rank rounded up to 0.1 ms, and zero intervals do not inflate FPS', () => {
  const record = createPerformanceRecord(); record.sample(frame);
  for (let i = 0; i < 19; i++) record.sample({ ...frame, intervalMs: 16.01 });
  record.sample({ ...frame, intervalMs: 90 }); record.sample({ ...frame, intervalMs: 0 });
  expect(record.read()).toMatchObject({ frames: 20, p95FrameMs: 16.1, maxFrameMs: 90 });
});

test('long frame evidence pairs an interval with the preceding and current updates', () => {
  const record = createPerformanceRecord();
  record.sample({ ...frame, tick: 1, logicMs: 180 });
  record.sample({ ...frame, tick: 6, intervalMs: 208, logicMs: 8, steps: 5, droppedTimeMs: 100 });
  expect(record.read().longFrames).toEqual([{
    frame: 1, segment: 1, segmentFrame: 1, foregroundMs: 208, intervalMs: 208,
    previousUpdate: { tick: 1, logicMs: 180, presentationMs: 3, steps: 1, droppedTimeMs: 0, counters: frame.counters },
    currentUpdate: { tick: 6, logicMs: 8, presentationMs: 3, steps: 5, droppedTimeMs: 100, counters: frame.counters },
  }]);
});

test('long frame evidence excludes pause boundaries and retains only the twenty largest intervals', () => {
  const record = createPerformanceRecord(); record.sample(frame);
  record.sample({ ...frame, tick: 1, intervalMs: 250 });
  const before = record.read();
  record.sample({ ...frame, active: false, intervalMs: 60000 });
  record.sample({ ...frame, tick: 10, intervalMs: 60000 });
  record.sample({ ...frame, tick: 11, intervalMs: 0, logicMs: 999 });
  record.sample({ ...frame, tick: 12, intervalMs: 33 });
  for (let i = 0; i < 25; i++) record.sample({ ...frame, tick: 13 + i, intervalMs: 34 + i });
  const after = record.read();
  expect(after).toMatchObject({ longFrameCount: 26, stuttersOver200Ms: 1, maxFrameMs: 250, excludedBoundaries: 2 });
  expect(after.longFrames).toHaveLength(20);
  expect(after.longFrames.map(value => value.intervalMs)).toEqual([250, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40]);
  expect(after.longFrames.at(-1)).toMatchObject({ segment: 2, segmentFrame: 8, previousUpdate: { tick: 18 }, currentUpdate: { tick: 19 } });
  expect(before.longFrames).toHaveLength(1);
  expect(Object.isFrozen(before.longFrames)).toBe(true);
  expect(Object.isFrozen(before.longFrames[0]?.previousUpdate.counters)).toBe(true);
});

test('update evidence owns its counters and rejects invalid ticks without changing the record', () => {
  const record = createPerformanceRecord(), counters = { ...frame.counters };
  record.sample({ ...frame, counters });
  counters.bombs = 9;
  record.sample({ ...frame, tick: 1, intervalMs: 201 });
  const before = record.read();
  expect(before.longFrames[0]?.previousUpdate.counters.bombs).toBe(2);
  for (const tick of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => record.sample({ ...frame, tick, intervalMs: 300 })).toThrow(RangeError);
    expect(record.read()).toEqual(before);
  }
  expect(Object.isFrozen(before.longFrames[0])).toBe(true);
  expect(Object.isFrozen(before.longFrames[0]?.currentUpdate)).toBe(true);
});
