export interface PerformanceCounters {
  readonly particles: number; readonly sounds: number; readonly textures: number; readonly objects: number;
  readonly bombs: number; readonly hazardCells: number; readonly aiSearchStates: number;
}
export interface PerformanceSample {
  readonly tick: number;
  readonly active: boolean; readonly intervalMs: number; readonly logicMs: number; readonly presentationMs: number;
  readonly steps: number; readonly droppedTimeMs: number; readonly counters: PerformanceCounters;
}

type UpdateEvidence = Readonly<Pick<PerformanceSample, 'tick' | 'logicMs' | 'presentationMs' | 'steps' | 'droppedTimeMs' | 'counters'>>;
interface LongFrameEvidence {
  readonly frame: number; readonly segment: number; readonly segmentFrame: number; readonly foregroundMs: number;
  readonly intervalMs: number; readonly previousUpdate: UpdateEvidence; readonly currentUpdate: UpdateEvidence;
}

function updateEvidence(value: PerformanceSample): UpdateEvidence {
  return Object.freeze({ tick: value.tick, logicMs: value.logicMs, presentationMs: value.presentationMs,
    steps: value.steps, droppedTimeMs: value.droppedTimeMs, counters: Object.freeze({ ...value.counters }) });
}

function percentile95(histogram: Uint32Array, frames: number, maximum: number): number | null {
  let rank = Math.ceil(frames * .95);
  for (let bucket = 0; frames && bucket < histogram.length; bucket++) {
    rank -= histogram[bucket]!;
    if (rank <= 0) return bucket === 10000 ? maximum : bucket / 10;
  }
  return null;
}

/** Observer only: supplied durations never enter gameplay or select performance settings. */
export function createPerformanceRecord() {
  let active = false, frames = 0, foregroundMs = 0, excludedBoundaries = 0;
  let logicMs = 0, presentationMs = 0, maxFrameMs = 0;
  let stuttersOver200Ms = 0;
  let longFrameCount = 0;
  const longFrames: LongFrameEvidence[] = [];
  let previousUpdate: UpdateEvidence | undefined;
  let maxSteps = 0, droppedTimeMs = 0, maxLogicMs = 0, maxPresentationMs = 0;
  const peaks: PerformanceCounters = { particles: 0, sounds: 0, textures: 0, objects: 0, bombs: 0, hazardCells: 0, aiSearchStates: 0 };
  let peakValues = peaks;
  const histogram = new Uint32Array(10001);
  const segmentHistogram = new Uint32Array(10001);
  let segmentFrames = 0, segmentMs = 0, segmentMaxFrameMs = 0, segmentStutters = 0;
  const readSegment = () => Object.freeze({ frames: segmentFrames, foregroundMs: segmentMs,
    averageFps: segmentMs ? segmentFrames * 1000 / segmentMs : null,
    p95FrameMs: percentile95(segmentHistogram, segmentFrames, segmentMaxFrameMs),
    maxFrameMs: segmentMaxFrameMs, stuttersOver200Ms: segmentStutters });
  let longestCompleted = readSegment();
  return {
    sample(value: PerformanceSample) {
      if (!Number.isSafeInteger(value.tick) || value.tick < 0) throw new RangeError('Performance tick must be a nonnegative safe integer');
      for (const number of [value.intervalMs, value.logicMs, value.presentationMs, value.steps, value.droppedTimeMs, ...Object.values(value.counters)]) {
        if (!Number.isFinite(number) || number < 0) throw new RangeError('Performance samples must be finite and nonnegative');
      }
      if (!value.active) {
        if (active) {
          if (segmentMs >= longestCompleted.foregroundMs) longestCompleted = readSegment();
          segmentFrames = 0; segmentMs = 0; segmentMaxFrameMs = 0; segmentStutters = 0; segmentHistogram.fill(0);
        }
        active = false; previousUpdate = undefined; return;
      }
      if (value.intervalMs === 0) return;
      const currentUpdate = updateEvidence(value);
      if (!active) { active = true; excludedBoundaries++; previousUpdate = currentUpdate; return; }
      frames++; foregroundMs += value.intervalMs; segmentFrames++; segmentMs += value.intervalMs;
      // The interval ends at this update; the preceding update may have caused it.
      if (value.intervalMs > 33) {
        longFrameCount++;
        longFrames.push(Object.freeze({ frame: frames, segment: excludedBoundaries, segmentFrame: segmentFrames,
          foregroundMs, intervalMs: value.intervalMs, previousUpdate: previousUpdate!, currentUpdate }));
        longFrames.sort((a, b) => b.intervalMs - a.intervalMs || a.frame - b.frame);
        if (longFrames.length > 20) longFrames.pop();
      }
      previousUpdate = currentUpdate;
      segmentMaxFrameMs = Math.max(segmentMaxFrameMs, value.intervalMs);
      if (value.intervalMs > 200) segmentStutters++;
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
      segmentHistogram[bucket] = segmentHistogram[bucket]! + 1;
    },
    read() {
      const p95FrameMs = percentile95(histogram, frames, maxFrameMs);
      const averageFps = foregroundMs ? frames * 1000 / foregroundMs : null;
      const qualification = segmentMs >= longestCompleted.foregroundMs ? readSegment() : longestCompleted;
      const verdict = qualification.foregroundMs < 60000 ? 'insufficient'
        : qualification.averageFps! >= 55 && qualification.p95FrameMs! <= 33 && qualification.maxFrameMs <= 200 ? 'pass' : 'fail';
      return Object.freeze({ frames, foregroundMs, longestSegmentMs: qualification.foregroundMs, qualification,
        longFrameCount, longFrames: Object.freeze([...longFrames]),
        excludedBoundaries, averageFps, stuttersOver200Ms,
        maxSteps, droppedTimeMs, maxLogicMs, maxPresentationMs, peaks: Object.freeze({ ...peakValues }),
        p95FrameMs, maxFrameMs, averageLogicMs: frames ? logicMs / frames : null,
        averagePresentationMs: frames ? presentationMs / frames : null, verdict });
    },
  };
}
