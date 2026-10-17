export interface PerformanceCounters {
  readonly particles: number; readonly sounds: number; readonly textures: number; readonly objects: number;
  readonly bombs: number; readonly hazardCells: number; readonly aiSearchStates: number;
}
export interface PerformanceSample {
  readonly active: boolean; readonly intervalMs: number; readonly logicMs: number; readonly presentationMs: number;
  readonly steps: number; readonly droppedTimeMs: number; readonly counters: PerformanceCounters;
}

/** Observer only: supplied durations never enter gameplay or select performance settings. */
export function createPerformanceRecord() {
  let active = false, frames = 0, foregroundMs = 0, segmentMs = 0, longestSegmentMs = 0, excludedBoundaries = 0;
  let logicMs = 0, presentationMs = 0, maxFrameMs = 0;
  let stuttersOver200Ms = 0;
  let maxSteps = 0, droppedTimeMs = 0, maxLogicMs = 0, maxPresentationMs = 0;
  const peaks: PerformanceCounters = { particles: 0, sounds: 0, textures: 0, objects: 0, bombs: 0, hazardCells: 0, aiSearchStates: 0 };
  let peakValues = peaks;
  const histogram = new Uint32Array(10001);
  return {
    sample(value: PerformanceSample) {
      for (const number of [value.intervalMs, value.logicMs, value.presentationMs, value.steps, value.droppedTimeMs, ...Object.values(value.counters)]) {
        if (!Number.isFinite(number) || number < 0) throw new RangeError('Performance samples must be finite and nonnegative');
      }
      if (!value.active) { active = false; segmentMs = 0; return; }
      if (value.intervalMs === 0) return;
      if (!active) { active = true; excludedBoundaries++; return; }
      frames++; foregroundMs += value.intervalMs; segmentMs += value.intervalMs;
      longestSegmentMs = Math.max(longestSegmentMs, segmentMs);
      logicMs += value.logicMs; presentationMs += value.presentationMs;
      maxSteps = Math.max(maxSteps, value.steps); droppedTimeMs += value.droppedTimeMs;
      maxLogicMs = Math.max(maxLogicMs, value.logicMs); maxPresentationMs = Math.max(maxPresentationMs, value.presentationMs);
      peakValues = { particles: Math.max(peakValues.particles, value.counters.particles), sounds: Math.max(peakValues.sounds, value.counters.sounds),
        textures: Math.max(peakValues.textures, value.counters.textures), objects: Math.max(peakValues.objects, value.counters.objects),
        bombs: Math.max(peakValues.bombs, value.counters.bombs), hazardCells: Math.max(peakValues.hazardCells, value.counters.hazardCells),
        aiSearchStates: Math.max(peakValues.aiSearchStates, value.counters.aiSearchStates) };
      maxFrameMs = Math.max(maxFrameMs, value.intervalMs);
      if (value.intervalMs > 200) stuttersOver200Ms++;
      const bucket = Math.min(10000, Math.ceil(value.intervalMs * 10)); histogram[bucket] = histogram[bucket]! + 1;
    },
    read() {
      let rank = Math.ceil(frames * .95), p95FrameMs: number | null = null;
      for (let bucket = 0; frames && bucket < histogram.length; bucket++) {
        rank -= histogram[bucket]!;
        if (rank <= 0) { p95FrameMs = bucket === 10000 ? maxFrameMs : bucket / 10; break; }
      }
      const averageFps = foregroundMs ? frames * 1000 / foregroundMs : null;
      const verdict = longestSegmentMs < 60000 ? 'insufficient' : averageFps! >= 55 && p95FrameMs! <= 33 && maxFrameMs <= 200 ? 'pass' : 'fail';
      return Object.freeze({ frames, foregroundMs, longestSegmentMs, excludedBoundaries, averageFps, stuttersOver200Ms,
        maxSteps, droppedTimeMs, maxLogicMs, maxPresentationMs, peaks: Object.freeze({ ...peakValues }),
        p95FrameMs, maxFrameMs, averageLogicMs: frames ? logicMs / frames : null,
        averagePresentationMs: frames ? presentationMs / frames : null, verdict });
    },
  };
}
