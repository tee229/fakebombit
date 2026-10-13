# Fake Bomb It

Issues #3–#5 implement a headless movement and bomb prototype on a fixed semantic map. It runs in Node without Phaser, a browser, artwork, system time, or uncontrolled randomness in the match module. The gameplay architecture is described in [issue #2](https://github.com/tee229/fakebombit/issues/2) and `docs/adr/`.

## Run

Browser task #6 is in progress. Its current slice installs Vite 8.3.4 and Phaser 3.90.0 and displays the fixed semantic training map in a texture-free Entities View. Keyboard input and fixed-step flow are not connected in this intermediate slice; their test seams and the code-review baseline are awaiting user confirmation. Run `pnpm dev` for the canvas preview. The production browser build is written to `dist/web`; `pnpm preview` serves it after a build. Headless output remains in `dist/match` and `dist/demo`.

Use Node 24.12 or newer and pnpm 10.27.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm demo
pnpm demo:bombs
pnpm demo:chains
node dist/demo/movement.js
node dist/demo/bombs.js
node dist/demo/chain-reactions.js
```

`pnpm check` runs both TypeScript checks, behavioral tests, the architecture guard, and the build. The core typecheck uses only ES2023, with no DOM or Node types. The movement demo takes a complete corner path, passes through another actor, recreates every tick from the initialization record, and demonstrates all three creation-error categories. The bomb demo verifies win, loss, draw, bomb leave permission, event order, reproduction, and terminal freeze. The chain demo verifies cycles, phase-start walls, next-tick cleared paths, seeded same-cell arbitration, capacity, and reproduction with reversed inputs. No rendering environment is required.

## Public match contract

Import `createMatch` and the associated contracts from `src/match/index.ts` (or `dist/match/index.js` after building).

```ts
const match = createMatch({ seed, map, actors, rules, playerId: 'player' });
const events = match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
const world = match.readWorld();
const retry = createMatch(world.initialization);
```

These are the three public operations: create a match, advance exactly one logical tick, and read its world. Callers submit cardinal gameplay intents (`up`, `right`, `down`, `left`) or `null` to release movement, with optional `bomb: true` for a one-step action. They never coordinate internal rule updates. Rules and initialization are frozen for each match. Specify `playerId` to enable victory, defeat, timeout, and terminal freeze; it must identify a configured actor and is recorded for retries. Omitting it retains the rules sandbox used by the movement demo, with no match result or timeout.

A semantic map contains positive integer dimensions, row-major `floor` ground cells, separately identified `solid-wall` / `breakable-wall` blockers, and named spawn markers. Actors reference spawn markers and begin at cell centers `(cell.x + 0.5, cell.y + 0.5)`. Multiple actors may use the same spawn. Actors, blockers, bombs, and fire hazards have unique stable entity identities; spawn marker identities are unique within their own namespace. Initial-map data stays unchanged, while current blockers, actors, bombs, hazards, and result are exposed separately in the world snapshot.

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

`world.initialization` stores the seed, fully resolved rules (including tick frequency), actor configuration, copied initial map, and implementation identifiers: `chain-bombs-v1`, `fixed-map-v1`, generator `none`, AI `none`. Creating from that record and submitting the same tick-indexed intent sequence reproduces the world. Incompatible recorded versions, including earlier movement/basic-bomb implementations, are rejected. The seed initializes a dedicated placement-arbitration stream. Seed alone does not promise reproduction across changed maps, rules, implementations, or runtime environments.

`createMatch` throws `MatchError` with a machine-readable `code` and explanation:

| Code | Meaning |
| --- | --- |
| `invalid-config` | Invalid seed, movement rules, actor configuration/identity, or implementation versions |
| `unknown-entity-type` | Unsupported blocker or actor type |
| `invalid-map` | Malformed map, invalid cells, conflicting blockers/markers, or missing/blocked spawn |
| `invalid-intent` | Invalid intent, unknown actor ID, or multiple intents for one actor in a tick |

Creation validation reports its first failure. Invalid tick intents reject the whole tick before changing state. A tick accepts at most one intent per actor; ordering independent actors' intents does not affect movement.

## Basic bombs and result rules

These defaults are prototype values; the timing boundaries were explicitly confirmed by the user in [issue #4](https://github.com/tee229/fakebombit/issues/4#issuecomment-6145866090).

| Rule | Default | Accepted range |
| --- | --- | --- |
| `bombCapacity` | 1 active bomb per actor | Positive safe integer |
| `blastRange` | 1 cell in each cardinal direction | Positive safe integer |
| `bombFuseSeconds` | 3 seconds | Positive finite duration resolving to safely representable ticks |
| `fireDurationSeconds` | 0.5 seconds | Positive finite duration resolving to safely representable ticks |
| `matchDurationSeconds` | 120 seconds | Positive finite duration resolving to safely representable ticks |

Duration ticks are `ceil(seconds * tickRate)`. Bombs store `placedAtTick` and `detonateAtTick`; fire hazards store cells, `createdAtTick`, and exclusive `expiresAtTick`. A bomb placed at tick-start n with fuse F explodes in the explosion phase of n+F. Fire is active on `[explosionTick, explosionTick + fireTicks)`. Movement during the step ending at the expiration boundary still encounters the old fire; movement starting at or after expiration does not. New explosions damage only moved actor positions, without retroactive damage along that step's earlier path. All damage uses the same logical square collision size as movement, with edge contact alone excluded.

Each tick validates input atomically, places bombs at start positions, moves actors and records contact with existing fire along the actual cardinal path (including turn segments), calculates all due explosions against phase-start blockers, destroys obstacles and eliminates actors, then decides the result. Placement checks active capacity and occupied cells before explosion processing, so a bomb due in this step still occupies its cell and consumes capacity during placement. Only the following step can use capacity released by that explosion.

Every actor overlapping a newly placed bomb may leave; the bomb's `exitActorIds` are removed after complete separation. Other actors and actors that already left are blocked. Solid walls stop fire without becoming hazardous. A breakable blocker cell becomes hazardous and is destroyed, stopping that ray. Current collision immediately uses the surviving blockers on the next tick; the initial semantic map remains intact.

One hit eliminates an actor. Eliminated actors retain their identity and final position, but cannot move or place bombs. With `playerId`, result priority is player death → loss, surviving player with no surviving opponents → win, otherwise reaching the time limit → draw. Result and a `match-ended` event appear in that same tick. Later `advanceTick` calls return no events and leave the entire world frozen, including bomb/fire timers.

Events are frozen, carry their logical `tick` and zero-based per-step `order`, and follow phase order: `bomb-placed`, `bomb-exploded`, `blocker-destroyed`, `actor-eliminated`, `match-ended`. Placement uses row-major cell order (y, then x), explosions use lexicographic bomb-ID order after collecting the full chain, destruction uses blocker-ID order, and elimination uses actor-ID order. Identity comparisons use JavaScript string order, not locale-dependent sorting. Hazard expiration is reflected in state rather than a separate event. Use a new match instance for retries and distinguish instances when consuming events.

## Chains and same-cell arbitration

An explosion ignites every bomb on its fire cells in that same phase. Bombs touching fire already active at tick start also enter the phase, even if that fire expires at the step's end. The phase computes the entire chain against one surviving-blocker snapshot, deduplicates bomb identities, and only then creates hazards/events, destroys blockers, and settles eliminations. Cycles and multiple roots cannot explode a bomb twice. A breakable blocker destroyed by one explosion still blocks every other explosion in that phase; later ticks use the cleared world. Other bombs trigger chains without stopping a fire ray; walls remain the propagation blockers.

Before arbitration, placement filters eliminated actors, full capacities, and occupied cells. Candidates are grouped by their start cell; groups run in row-major order and candidates use actor-ID order. Each contested group draws one winner; single valid requests need no random draw. Only successful placement consumes capacity. Leave permission belongs to every living actor overlapping the new bomb, including losers and actors that did not request placement.

`arbitration.ts` owns one private, reproducible stream. Its seed is a UTF-16 FNV-1a hash of `fakebombit:placement-arbitration:v1` + a NUL separator + the match seed. A 32-bit LCG advances state; a bijective bit mixer removes raw low-bit patterns, and rejection sampling maps output to a candidate index without modulo bias. Other rule work, solo/invalid/occupied placement requests, snapshots, and presentation do not consume it. The algorithm, namespace, ordering, and consumption rules belong to `chain-bombs-v1`; changing them requires an implementation version change. Retry recreates the stream and replays inputs from initialization.

## Architecture guard

`scripts/check-architecture.ts` uses the TypeScript AST, checks all core `.ts` files, and resolves imports/re-exports/dynamic imports. Only dependencies on checked TypeScript files inside `src/match` are permitted; package imports, outside-core dependencies, unchecked files, and symlinks fail. It rejects known host globals, clock access (including `Date`, `performance`, and implicit `Intl` time), `Math.random`, common aliases/computed access that can hide randomness, runtime code generation, and visual/audio filename references. Deterministic direct math is allowed, and comments are ignored. CLI fixtures verify rejection and acceptance rather than testing internal checker helpers.

The guard is deliberately conservative: aliasing the entire `Math` object, using host globals in types, or accessing runtime module metadata is rejected. It is an architecture regression check combined with core typechecking, not a sandbox for adversarial JavaScript.

AI, map generation, Phaser, and UI remain later tickets.
