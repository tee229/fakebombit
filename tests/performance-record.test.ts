import { expect, test } from 'vitest';
import { createPerformanceRecord } from '../src/diagnostics/performance-record.js';

const frame = { active: true, intervalMs: 20, logicMs: 2, presentationMs: 3, steps: 1, droppedTimeMs: 0,
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

test('percentiles use nearest rank rounded up to 0.1 ms, and zero intervals do not inflate FPS', () => {
  const record = createPerformanceRecord(); record.sample(frame);
  for (let i = 0; i < 19; i++) record.sample({ ...frame, intervalMs: 16.01 });
  record.sample({ ...frame, intervalMs: 90 }); record.sample({ ...frame, intervalMs: 0 });
  expect(record.read()).toMatchObject({ frames: 20, p95FrameMs: 16.1, maxFrameMs: 90 });
});
