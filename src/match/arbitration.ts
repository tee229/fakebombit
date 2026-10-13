// This stream belongs only to same-cell placement conflicts, never other rules or presentation.
export function createArbitrationRandom(seed: string): (size: number) => number {
  const text = `fakebombit:placement-arbitration:v1\0${seed}`;
  let state = 2166136261;
  for (let index = 0; index < text.length; index++) {
    state = Math.imul(state ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return size => {
    const limit = 4294967296 - (4294967296 % size);
    let draw: number;
    do {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      // Mix high bits into low bits before bounded sampling; raw LCG parity would lock two alternating conflicts.
      draw = Math.imul(state ^ (state >>> 16), 0x7feb352d);
      draw = Math.imul(draw ^ (draw >>> 15), 0x846ca68b);
      draw = (draw ^ (draw >>> 16)) >>> 0;
    } while (draw >= limit);
    return draw % size;
  };
}
