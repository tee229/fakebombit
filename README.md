# Fake Bomb It

Issue #3 implements a headless movement prototype on a fixed semantic map. It runs in Node without Phaser, a browser, artwork, system time, or random-number calls in the match module. The gameplay architecture is described in [issue #2](https://github.com/tee229/fakebombit/issues/2) and `docs/adr/`.

Issue #4 is in progress. The current slice adds optional `bomb: true` intents, placement at the tick-start cell, frozen ordered placement events, positive-integer `bombCapacity` (default 1), and bomb collision. Every actor overlapping a newly placed bomb can leave it; the permission is removed after complete separation. Bomb entity identities are stable and distinct from actor/blocker identities. Same-cell conflicting requests are skipped together until issue #5 adds arbitration. Detonation, damage, and results are pending confirmation of the timing boundaries required by issue #4; bombs in this intermediate slice do not expire.

## Run

Use Node 24.12 or newer and pnpm 10.27.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm demo
node dist/demo/movement.js
```

`pnpm check` runs both TypeScript checks, behavioral tests, the architecture guard, and the build. The core typecheck uses only ES2023, with no DOM or Node types. The demo takes a complete corner path, passes through another actor, recreates every tick from the initialization record, and demonstrates all three creation-error categories. No rendering environment is required.

## Public match contract

Import `createMatch` and the associated contracts from `src/match/index.ts` (or `dist/match/index.js` after building).

```ts
const match = createMatch({ seed, map, actors, rules });
const events = match.advanceTick([{ actorId: 'player', move: 'right' }]);
const world = match.readWorld();
const retry = createMatch(world.initialization);
```

These are the three public operations: create a match, advance exactly one logical tick, and read its world. Callers submit cardinal gameplay intents (`up`, `right`, `down`, `left`) or `null` to release movement. They never coordinate internal rule updates. The movement-only slice returns an empty readonly event list; it does not invent movement events. Movement rules and initialization are frozen for each match.

A semantic map contains positive integer dimensions, row-major `floor` ground cells, separately identified `solid-wall` / `breakable-wall` blockers, and named spawn markers. Actors reference spawn markers and begin at cell centers `(cell.x + 0.5, cell.y + 0.5)`. Multiple actors may use the same spawn. Actors and blockers have unique stable entity identities; spawn marker identities are unique within their own namespace. Initial-map data stays unchanged, while current blockers and actors are exposed separately in the world snapshot. This slice has no obstacle destruction.

Positions are continuous cell units. Collision uses an axis-aligned square with a rule-defined half-width (`radius`), never sprite dimensions. Swept cardinal movement stops at map edges and blocker contact, including at speeds that cross several cells in one tick. Actors do not block each other. `previousPosition` and `position` provide consecutive tick positions for future presentation interpolation. Every snapshot and its nested data are frozen; subsequent ticks do not change earlier snapshots. Caller-owned configuration is copied rather than frozen or retained.

## Prototype movement parameters

These values are initial prototype choices, **not final balance or device-validated feel**.

| Rule | Default | Accepted range |
| --- | --- | --- |
| `tickRate` | 60 ticks/second | Positive safe integer |
| `speed` | 3 cells/second | Positive finite number |
| `radius` | 0.3 cells | Greater than 0, less than 0.5 |
| `turnBufferTicks` | 8 extra ticks | Nonnegative safe integer |
| `turnTolerance` | 0.12 cells | At least 0, less than 0.5 |

Supply any subset of rules; omitted values use the defaults. Explicit `undefined`, unsupported rule keys, and invalid numeric values fail validation.

A perpendicular request is buffered for the request tick plus `turnBufferTicks` subsequent ticks. The actor continues its previous heading while seeking a usable cell center; after expiry it stops unless a new intent is supplied. Repeated requests refresh the window. A same-axis request, including reversal, takes effect immediately and replaces any pending turn. Explicit `null` cancels the buffer and stops. With no intent and no active buffer, the actor stops; callers repeat held input on each tick.

A turn within `turnTolerance` of the nearest center may snap to that center at tick start and then use the full tick travel in its new direction. The snap is a bounded rule adjustment and may add up to the configured tolerance to total travel; collision checks still apply. Otherwise the actor travels to a reachable open center, turns there, and uses the remaining tick distance. Blocked turns wait for a later usable center. A stationary actor can begin moving toward an adjacent wall until collision contact. Setting tolerance to 0 disables positional snapping beyond numerical roundoff; setting the buffer to 0 permits only the request tick. Logical ticks never read wall-clock time.

## Reproduction and failures

`world.initialization` stores the seed, fully resolved rules (including tick frequency), actor configuration, copied initial map, and implementation identifiers: `basic-bombs-v1`, `fixed-map-v1`, generator `none`, AI `none`. Creating from that record and submitting the same tick-indexed intent sequence reproduces the world. Incompatible recorded versions are rejected. A seed is retained as match identity; this fixed-map slice consumes no randomness. Seed alone does not promise reproduction across changed maps, rules, implementations, or runtime environments.

`createMatch` throws `MatchError` with a machine-readable `code` and explanation:

| Code | Meaning |
| --- | --- |
| `invalid-config` | Invalid seed, movement rules, actor configuration/identity, or implementation versions |
| `unknown-entity-type` | Unsupported blocker or actor type |
| `invalid-map` | Malformed map, invalid cells, conflicting blockers/markers, or missing/blocked spawn |
| `invalid-intent` | Invalid intent, unknown actor ID, or multiple intents for one actor in a tick |

Creation validation reports its first failure. Invalid tick intents reject the whole tick before changing state. A tick accepts at most one intent per actor; ordering independent actors' intents does not affect movement.

## Architecture guard

`scripts/check-architecture.ts` uses the TypeScript AST, checks all core `.ts` files, and resolves imports/re-exports/dynamic imports. Only dependencies on checked TypeScript files inside `src/match` are permitted; package imports, outside-core dependencies, unchecked files, and symlinks fail. It rejects known host globals, clock access (including `Date`, `performance`, and implicit `Intl` time), `Math.random`, common aliases/computed access that can hide randomness, runtime code generation, and visual/audio filename references. Deterministic direct math is allowed, and comments are ignored. CLI fixtures verify rejection and acceptance rather than testing internal checker helpers.

The guard is deliberately conservative: aliasing the entire `Math` object, using host globals in types, or accessing runtime module metadata is rejected. It is an architecture regression check combined with core typechecking, not a sandbox for adversarial JavaScript.

AI, map generation, Phaser, and UI remain later tickets.
