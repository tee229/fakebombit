# Fake Bomb It

原15项首版实施进度 **14/15**；2026-10-30用户接受Chrome性能已知限制并关闭#16/#19，当前进入#17微信小游戏适配的开发环境核对。明暗界面、触屏操作、背景音乐及iPad修复已获用户功能验收，原性能失败报告保留。当前工具与待补条件见[微信开发环境核对](docs/validation/issue-17-environment-2026-10-30.md)，完整清单见[实施进度](docs/implementation-status.md)。

Issues #3–#11 implement headless movement, bombs, power-ups, normal AI battles and validated seeded semantic maps. It runs in Node without Phaser, a browser, artwork, system time, or uncontrolled randomness in the match module. The gameplay architecture is described in [issue #2](https://github.com/tee229/fakebombit/issues/2) and `docs/adr/`.

## Run

Before starting, choose 糖果乐园 or 玩具工厂 with left/right, and **薄荷兔 or 珊瑚机甲** with up/down; click the canvas panels or press Enter to start. Either skin works with either theme. Characters have idle, four-direction movement/turning and one-shot elimination frames. R retains skin, theme and match initialization; N allows choosing again. Hats were removed from the release scope by user confirmation. See the [skin contract](docs/builtin-skins.md) and [validation](docs/validation/issue-13-skins.md).

Run `pnpm dev` and open <http://127.0.0.1:5173/> to play a validated 17×15 seeded arena against three normal AIs. **玩家 / AI 1 / AI 2 / AI 3** have side cards showing their portraits, survival state, active bombs/capacity, range and speed; matching ground-ring colors identify actors without covering them with names. The size references the original Bomb It screenshot, as an estimate including this project's border. In landscape, use the left four-way joystick and right bomb button; multiple pointers can move and bomb together. Use **WASD / arrow keys**, **Space**, and **R**, or the canvas retry button. **R / 重试** recreates the same initialization; **N / 新开一局** chooses a different seed, also available at the bottom left. The seed is displayed below the map and stored in `?seed=...` for sharing or replay. **P / Escape** toggles pause; **Enter** or the canvas continue button resumes manually. Leaving the page pauses the match and clears input; returning does not resume it automatically. Debug parameters `?ai=1` / `?ai=2` reduce opponents and `?seconds=1..120` shorten the default 120-second limit. `?arena=training` retains the original fixed arena. See [normal battle validation](docs/validation/issue-11-normal-battle.md), [map generation rules](docs/validation/issue-10-map-generation.md), [touch and pause validation](docs/validation/issue-7-touch-and-pause.md), and [side-card validation](docs/validation/issue-18-actor-cards.md).

Open <http://127.0.0.1:5173/?arena=items> for the power-up practice arena. Move up, then right to collect range, capacity and speed. Its three drops come from real explosions using the normal 50% chance and a fixed seed; a 211-tick preparation clears the fire before controls start. Retry repeats that preparation. The HUD shows live abilities, and distinct symbols/labels identify the three kinds. Bombing two different cells demonstrates capacity; longer fire rays and faster movement show the other gains. The ordinary arena also drops items when crates are destroyed. See [item rules and validation](docs/validation/issue-8-items.md).

Open <http://127.0.0.1:5173/?arena=escape> to watch one AI escape a repeatable chain. Bombs nominally due at ticks 180 and 195 both explode at 180; the AI moves out of their rays and survives the lasting fire. **R** repeats the same preparation and scene. The HUD shows observing, escaping, safe, unconfirmed-route or budget status, and the AI has a distinct ring and label. See [escape AI validation](docs/validation/issue-9-escape-ai.md).

Open <http://127.0.0.1:5173/?arena=normal> for a controlled normal-AI escape-sealing exercise. Three normal AIs share a dead-end spawn; all use ordinary movement, abilities and bomb rules. After R, immediately place a bomb, move left and then down to leave its rays. Sealing their exit demonstrates a real victory through ordinary intents. This fixed diagnostic layout verifies the outcome flow and is not a random-map difficulty sample.

菜单设置按钮或局内工具栏可打开设置。操作页独立调整摇杆距左/距底、放弹距右/距底，数值从控件外缘量到屏幕安全区边缘；浮动模式在左侧操作区按下定位，拖动后移动，松手隐藏，并保留固定位置。边距随当前视口约束而不覆盖偏好，恢复操作默认值不改音量、粒子或明暗。音量分类可独立调节背景音乐与音效；用户提供的背景音乐在首次操作后循环播放，跨局不叠加，暂停后手动恢复会接着播放。两种音量和其他设置跨访问保存；局内打开会暂停，关闭后手动继续。明暗开关同时切换界面与当前主题包，两种外观开局前均准备，切换保留本局进度。

The browser uses Vite **8.3.4** and Phaser **3.90.0**, verified against the npm registry and official documentation during implementation. Phaser 3 supplies Canvas/WebGL rendering and the documented scene/scale interfaces; the registry's current Phaser 4 release was also checked. `pnpm build` writes the production browser build to `dist/web`; `pnpm preview` serves it on <http://127.0.0.1:4173/>. Headless output remains in `dist/match` and `dist/demo`.

Use Node 24.12 or newer and pnpm 10.27.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm demo
pnpm demo:bombs
pnpm demo:chains
pnpm demo:items
pnpm demo:escape
node dist/demo/movement.js
node dist/demo/bombs.js
node dist/demo/chain-reactions.js
node dist/demo/items.js
node dist/demo/escape.js
```

`pnpm check` runs all three TypeScript checks, behavioral tests, the architecture guard, and both builds. The core typecheck uses only ES2023, with no DOM or Node types. The movement demo takes a complete corner path, passes through another actor, recreates every tick from the initialization record, and demonstrates all three creation-error categories. The bomb demo verifies win, loss, draw, bomb leave permission, event order, reproduction, and terminal freeze. The chain demo verifies cycles, phase-start walls, next-tick cleared paths, seeded same-cell arbitration, capacity, and reproduction with reversed inputs. No rendering environment is required for those demos or rule tests.

## Public match contract

Import `createMatch` and the associated contracts from `src/match/index.ts` (or `dist/match/index.js` after building).

```ts
const match = createMatch({ seed, map, actors, rules, playerId: 'player' });
const events = match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
const world = match.readWorld();
const retry = createMatch(world.initialization);
const generated = createMatch({ seed, generator: {}, actors, playerId: 'player' });
```

These are the three public operations: create a match, advance exactly one logical tick, and read its world. Callers submit cardinal gameplay intents (`up`, `right`, `down`, `left`) or `null` to release movement, with optional `bomb: true` for a one-step action. They never coordinate internal rule updates. Rules and initialization are frozen for each match. Specify `playerId` to enable victory, defeat, timeout, and terminal freeze; it must identify a configured actor and is recorded for retries. Omitting it retains the rules sandbox used by the movement demo, with no match result or timeout.

A semantic map contains positive integer dimensions, row-major `floor` ground cells, separately identified `solid-wall` / `breakable-wall` blockers, and named spawn markers. Actors reference spawn markers and begin at cell centers `(cell.x + 0.5, cell.y + 0.5)`. Multiple actors may use the same spawn. Actors, blockers, bombs, fire hazards and items have unique stable entity identities; spawn marker identities are unique within their own namespace. Initial-map data stays unchanged, while current blockers, actors, bombs, hazards, items and result are exposed separately in the world snapshot. Actors expose current `abilities` (`bombCapacity`, `blastRange`, `speed`); initialization rules remain unchanged after pickup.

Positions are continuous cell units along cell center lines: at least one coordinate stays at an integer plus 0.5. Swept cardinal movement stops at the last traversable cell center before a wall, bomb or map edge, including at speeds that cross several cells in one tick. Pressing toward an adjacent wall leaves the actor centered, ready to turn immediately into an open corridor. The rule-defined half-width (`radius`) still controls the actor's square overlap for fire damage and bomb leave permission; sprite dimensions never affect rules. Actors do not block each other. `previousPosition` and `position` provide consecutive tick positions for presentation interpolation. Every snapshot and its nested data are frozen; subsequent ticks do not change earlier snapshots. Caller-owned configuration is copied rather than frozen or retained.

The center-line movement decision and its trade-offs are recorded in [ADR 0004](docs/adr/0004-continuous-movement-on-cell-center-lines.md).

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

A turn within `turnTolerance` of the nearest center may snap to that center at tick start and then use the full tick travel in its new direction. The snap is a bounded rule adjustment and may add up to the configured tolerance to total travel; collision checks still apply. Otherwise the actor travels to a reachable open center, turns there, and uses the remaining tick distance. Blocked turns wait for a later usable center. After releasing between centers, a perpendicular restart walks along the existing center line toward the nearest intersection with an open requested exit, using the normal tick travel budget before turning. It never starts a second off-center axis. Setting tolerance to 0 disables positional snapping beyond numerical roundoff; setting the buffer to 0 permits only the request tick. Logical ticks never read wall-clock time.

## Reproduction and failures

`world.initialization` stores the seed, fully resolved rules (including tick frequency), actor and AI configuration, copied initial map, and implementation identifiers: match `normal-battle-v1`, map `semantic-map-v1`, generator `symmetric-map-v1`, AI `normal-ai-v1`. Generated maps also record resolved generator settings, every attempted candidate's outcome, fallback source, and spawn safety proofs. Creating from that record regenerates and verifies those facts; submitting the same tick-indexed intent sequence reproduces the world. Earlier implementations, including `generated-map-v1`, are rejected. The seed initializes separate map generation, placement, drop, pickup and per-normal-AI streams. Seed alone does not promise reproduction across changed maps, rules, implementations, or runtime environments.

Use `generator: {}` instead of `map` to request generation. Generated spawn IDs are `player`, `target-1`, `target-2`, `target-3`; actors reference these markers. Defaults are width 17, height 15, `blockerChance: 0.45`, `maxAttempts: 12`, `maxSearchStates: 6000`, `searchHorizonSeconds: 6`. Width/height must be odd integers from 7 through 25. Attempts may be zero; search limits must be positive. Reflection symmetry, starting space, nearby resources, connectivity without crates and initial bomb escape are checked before acceptance. Exhausting candidates validates a resource-bearing base layout under the same rules; failure there throws a `MapGenerationError` with bounded attempt diagnostics. Successful initial escape does not prevent later self-trapping.

`createMatch` throws `MatchError` with a machine-readable `code` and explanation:

| Code | Meaning |
| --- | --- |
| `invalid-config` | Invalid seed, movement rules, actor configuration/identity, or implementation versions |
| `unknown-entity-type` | Unsupported blocker or actor type |
| `invalid-map` | Malformed map, invalid cells, conflicting blockers/markers, or missing/blocked spawn |
| `invalid-intent` | Invalid intent, unknown actor ID, or multiple intents for one actor in a tick |
| `generation-failed` | All configured random candidates and the validated base layout failed; inspect error `attempts` for reasons |

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

Each tick validates input atomically, activates eligible pending items, places bombs at start positions, moves actors and records contact with existing fire along the actual cardinal path (including turn segments), calculates all due explosions against phase-start blockers, burns active items, destroys obstacles and spawns pending drops, eliminates actors, settles living actors' pickups, then decides the result. Placement checks current actor capacity and occupied cells before explosion processing, so a bomb due in this step still occupies its cell and consumes capacity during placement. Only the following step can use capacity released by that explosion or an upgrade collected in this step. Each bomb locks the owner's `blastRange` when placed; later range pickups cannot extend that bomb or its chain explosion.

Every actor overlapping a newly placed bomb may leave; the bomb's `exitActorIds` are removed after complete separation. Other actors and actors that already left are blocked. If leave permission ends between centers, reversing toward that bomb stops at the actor's current position rather than moving it backwards to a center; moving away and subsequent center-line turns remain possible. Solid walls stop fire without becoming hazardous. A breakable blocker cell becomes hazardous and is destroyed, stopping that ray. Current collision immediately uses the surviving blockers on the next tick; the initial semantic map remains intact.

One hit eliminates an actor. Eliminated actors retain their identity and final position, but cannot move or place bombs. With `playerId`, result priority is player death → loss, surviving player with no surviving opponents → win, otherwise reaching the time limit → draw. Result and a `match-ended` event appear in that same tick. Later `advanceTick` calls return no events and leave the entire world frozen, including bomb/fire timers.

Events are frozen, carry their logical `tick` and zero-based per-step `order`, and follow phase order: `bomb-placed`, `bomb-exploded`, `item-destroyed`, `blocker-destroyed`, `item-spawned`, `actor-eliminated`, `item-collected`, `match-ended`. Placement and item settlement use row-major cell order (y, then x), explosions use lexicographic bomb-ID order after collecting the full chain, destruction uses blocker-ID order, and elimination uses actor-ID order. Identity comparisons use JavaScript string order, not locale-dependent sorting. Hazard expiration and item activation are reflected in state rather than separate events. Use a new match instance for retries and distinguish instances when consuming events.

## Chains and same-cell arbitration

An explosion ignites every bomb on its fire cells in that same phase. Bombs touching fire already active at tick start also enter the phase, even if that fire expires at the step's end. The phase computes the entire chain against one surviving-blocker snapshot, deduplicates bomb identities, and only then creates hazards/events, destroys blockers, and settles eliminations. Cycles and multiple roots cannot explode a bomb twice. A breakable blocker destroyed by one explosion still blocks every other explosion in that phase; later ticks use the cleared world. Other bombs trigger chains without stopping a fire ray; walls remain the propagation blockers.

Before arbitration, placement filters eliminated actors, full capacities, and occupied cells. Candidates are grouped by their start cell; groups run in row-major order and candidates use actor-ID order. Each contested group draws one winner; single valid requests need no random draw. Only successful placement consumes capacity. Leave permission belongs to every living actor overlapping the new bomb, including losers and actors that did not request placement.

The placement stream seed is a UTF-16 FNV-1a hash of `fakebombit:placement-arbitration:v1` + a NUL separator + the match seed. A 32-bit LCG advances state; a bijective bit mixer removes raw low-bit patterns, and rejection sampling maps output to a candidate index without modulo bias. Other rule work, solo/invalid/occupied placement requests, snapshots, and presentation do not consume it. Its algorithm, namespace and consumption remain those introduced with `chain-bombs-v1`. Drop and pickup streams use the same sampler with independent `item-drop` and `item-pickup` namespaces. Changing algorithms, ordering or consumption requires an implementation version change. Retry recreates all streams and replays inputs from initialization.

## Power-ups

User-confirmed #8 rules and boundary evidence are recorded in [item validation](docs/validation/issue-8-items.md).

| Rule | Default | Accepted range |
| --- | --- | --- |
| `itemDropChance` | 0.5 | Finite number in [0, 1] |
| `capacityGain` / `rangeGain` | 1 / 1 | Positive safe integers |
| `speedGain` | 0.5 cells/second | Positive finite number |
| `maxBombCapacity` / `maxBlastRange` | 4 / 6 | Safe integers at least their initial ability |
| `maxSpeed` | 5 cells/second | Finite number at least initial speed |

Omitted caps resolve to the greater of their default and initial ability, preserving existing high-speed/capacity scenarios. Explicit caps below initial abilities are invalid. A pickup consumes its instance even at the cap; the collected event exposes the resulting abilities, and the ability never decreases.

Each destroyed breakable blocker consumes a 32-bit probability draw, in row-major cell order; a successful drop consumes a uniform three-way kind draw. `ItemState.type` is `item.capacity`, `item.range` or `item.speed`. New items have `active: false` and `spawnedAtTick`. All fire on their cell must disappear before the next step activates them. Pending items are protected from overlapping fire; active items burn when a new explosion reaches them. This permits safe pickup after the creating fire, while later bombing can destroy an available item.

Pickup occurs after damage and before the match result. Only living actors whose final cell contains an active item participate; crossing a cell without ending there does not collect it. Contenders sort by actor ID and use a dedicated pickup stream; one valid actor needs no draw. Each instance is consumed once. Movement and placement use pre-pickup abilities, so increases take effect on the next step. `pnpm demo:items` demonstrates actual capacity, blast and travel differences through the public match operations, with initialization replay checks.

## Danger forecast and escape AI

Set `ai: {}` on an actor configuration to use the escape controller. AI configuration is copied, resolved and frozen in initialization, while `ActorState.ai` exposes frozen status, last decision tick, searched-state count and remaining plan steps. External intents for controlled actors fail atomically with `invalid-intent`; internal AI intents enter the same placement/movement/settlement pipeline. This escape-only controller emits movement and release, never a bomb action.

| AI setting | Default | Validation |
| --- | --- | --- |
| `reactionSeconds` | 0.2 | Finite, nonnegative, safely representable in ticks |
| `decisionIntervalSeconds` | 0.1 | Positive finite duration resolving to safe ticks |
| `maxSearchStates` | 6000 | Positive safe integer |
| `searchHorizonSeconds` | 6 | Positive finite duration resolving to safe ticks |

Durations round up to logical ticks. Each step observes only tick-start bombs, hazards, blockers and the actor's current abilities. Changed facts discard the old plan and start the reaction delay; planning waits for both that delay and the decision cadence. Subsequent planned directions use ordinary per-step input. There is no future player input, future random-drop knowledge, navigation teleport or speed override. The escape-only controller uses deterministic direction ordering (up, right, down, left, wait) without consuming randomness.

The internal, user-approved query seam `forecastDanger(world)` in `src/match/forecast.ts` accepts a match snapshot and returns frozen explosion cells/deadlines, exclusive danger windows and temporary blocker/bomb changes. It jumps between known explosion events rather than iterating through idle ticks. `calculateExplosions` is shared with real stepping, including phase-start blockers, chains, destruction and bomb-specific range. Current fire keeps its original interval. Queries never alter the match or consume gameplay streams. A terminal match has no future projection. Before termination, the physical projection assumes the rule clock keeps advancing and no unknown new actions occur; it does not speculate about future result arbitration or pickups.

The bounded route search works in time and continuous position, using shared real movement and collision geometry. Each candidate step checks swept contact with tick-start fire, endpoint contact with new explosions, future cleared walls, current speed and branch-specific bomb leave permissions. A goal must permit waiting through **all** forecast danger windows, including windows beyond the route-search horizon. Waiting is a real action, so a route can cross a corridor after fire has expired. Previously lost bomb leave permission cannot be regained. Float-rounded search keys only merge search alternatives; candidate positions themselves use exact movement results.

If the search cannot confirm a route within its horizon or state budget, the escape AI stops; later decisions retry. `no-route` means no route was confirmed within these bounds, not a proof that escape is always impossible. Unknown new actions can invalidate a plan, and finite reaction delay can prevent survival. `pnpm demo:escape` checks a real staggered chain, survival and 220 steps of identical replay.

## Normal AI

Set `ai: { mode: 'normal' }` to add item seeking, obstacle breaking and threats against other living actors. This uses the same timing/search settings above plus nonnegative finite `pickupWeight: 3`, `crateWeight: 2`, `threatWeight: 1`. Zero disables a goal category; all zeros retain only escape behavior. Initial values are prototype tuning, not final balance.

Reachable goals score weight / (shortest passable cell distance + 1); equal scores use a stable candidate order and an independent `ai:<actorId>` seeded stream, retaining a previous equal-best goal. Only activated items are targeted. Current blockers and bombs define reachability; actors pass through each other. Frozen diagnostics also expose a goal and collecting/breaking/threatening status.

Normal AI uses bounded goal-guided logical-step searches with the authoritative movement/damage queries. A route may first reach a verified safe intermediate point toward a distant goal. Before bombing it adds an ordinary candidate bomb to the known-danger prediction and requires a confirmed escape. Useful blast targets are checked by the shared explosion phase. A predicted self-placement can continue its committed escape; unexpected facts cancel that plan and restart observation. Search limits apply to each query, not the combined work of an entire decision. Future player actions or pickups are not predicted. See [normal battle evidence and limitations](docs/validation/issue-11-normal-battle.md).

## Architecture guard

`scripts/check-architecture.ts` uses the TypeScript AST, checks all core `.ts` files, and resolves imports/re-exports/dynamic imports. Only dependencies on checked TypeScript files inside `src/match` are permitted; package imports, outside-core dependencies, unchecked files, and symlinks fail. It rejects known host globals, clock access (including `Date`, `performance`, and implicit `Intl` time), `Math.random`, common aliases/computed access that can hide randomness, runtime code generation, and visual/audio filename references. Deterministic direct math is allowed, and comments are ignored. CLI fixtures verify rejection and acceptance rather than testing internal checker helpers.

The guard is deliberately conservative: aliasing the entire `Math` object, using host globals in types, or accessing runtime module metadata is rejected. It is an architecture regression check combined with core typechecking, not a sandbox for adversarial JavaScript.

## Browser input, flow, and interpolation

`src/game-flow/index.ts` owns menu, preparation, play, pause, result and failure; `src/browser/theme-scene.ts` renders menu states, and `src/browser/main.ts` composes resources, input and Phaser presentation; the session exclusively advances its match through the three existing public operations. The renderer only reads frozen state and ordered events. Browser types use a separate TypeScript configuration; the match still checks with ES2023 only, without DOM/Node/engine types.

The keyboard interface owns held keys and a pending bomb action. The most recently pressed held direction wins, and releasing it restores another held direction. Automatic repeats never re-order directions or queue another bomb. `createPlayerInput` adds separately owned joystick and bomb pointers and outputs the same `GameplayIntent` contract. An active joystick owns movement, including neutral input inside its dead zone; when released, held keyboard movement is available again. Bomb taps from either device coalesce into one pending action, survive render frames without a logical step, and are consumed once on the first executed step, while movement continues through catch-up steps. Pointer cancellation clears all held input and pending actions. Restart creates fresh input, match, session, view, and event-consumption context; scene cleanup removes browser listeners, releases pointer capture and stops sound instances.

Joystick offsets are normalized to its base radius. Input configuration defaults to `deadZone: 0.2` and `directionThreshold: 1.25`: neutral movement inside 20% of the radius, then four cardinal directions with a ratio-based hysteresis band to prevent diagonal jitter. The initial direction uses the dominant axis, preferring horizontal at a tie; thereafter the other axis must exceed the held axis by the configured ratio to switch. These are prototype input settings awaiting real touch feedback, separate from the shared center-line movement and turn tolerance. `deadZone` accepts finite values in `[0, 1)`; `directionThreshold` is finite and at least 1. Browser pointer capture keeps a drag owned outside its initial control; `pointercancel`, unexpected capture loss, resize and pause release it. Coordinates use the current canvas bounds, so CSS scaling does not change the input contract. See [MDN pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

`createGameSession(match, input).advanceFrame(deltaMs)` owns the accumulator. It accepts finite, nonnegative milliseconds from the browser loop and returns frozen world, events, interpolation `alpha`, executed `steps`, and `droppedTimeMs`. It never reads the clock itself. At most **5 logical steps per render frame** run. At the default 60 Hz this is 83.33 ms of work; additional whole-step backlog is discarded while the fractional remainder is preserved. Foreground stalls deliberately slow game time instead of creating an unbounded catch-up burst. The policy is verified with a 1000 ms stall: 5 steps execute, 916.67 ms is discarded, and the next zero-duration frame does not keep catching up.

Normal 30/60/120 FPS frame sequences all advance 60 ticks, 3 cells, and the same bomb deadline per second. The view interpolates copies of positions between the two logical snapshots along their cardinal corner path, keeping the displayed actor on center lines; it never overwrites either position. Terminal frames use the final logical position, stop all future stepping, and do not repeat ending events. The view's per-instance `(tick, order)` cursor prevents repeated presentation of an event; retries reset it. Canvas data attributes expose read-only observability for tick, player position, bomb/fire counts, result, and consumed-event count.

`GameSession.pause(reason)` freezes the match, discards fractional accumulated time and clears input. `resume()` requires an explicit caller action, clears input again and discards the first elapsed frame, preventing background time from entering the match. Presentation holds the frozen logical position until a fresh step to avoid interpolation rewind. Ended sessions cannot pause or resume. Browser `blur`, hidden `visibilitychange` and `pagehide` request background pause; a visible return never calls resume. The manual continue action also requires a visible, focused page. Phaser audio pause/resume/stop hooks share this lifecycle; the arena now uses optional, original short PCM sounds with run-owned bounded voices. Pause destroys one-shot voices, and resume never replays them; see [feedback ownership and controls](docs/feedback.md). The browser checks both focus and visibility because they describe different page states ([MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)). Canvas observability adds phase, pause reason and joystick direction.

For rendering-frequency checks, open `/?fps=30`, `/?fps=60`, or `/?fps=120`. These debug overrides change Phaser's render scheduling only, with unsmoothed elapsed frame time supplied to the session. Default rendering uses requestAnimationFrame. The arena uses a 1024 × 576 landscape canvas with controls on separate side rails, an unobscured board and CSS safe-area insets. Desktop pointer checks and 844 × 390 viewport checks verify layout and hit targets; they do not establish physical multi-touch or mobile lifecycle behavior.

For #6, the user confirmed keyboard-intent and game-session frame seams with review baseline `b1986ee`. For #7, the user confirmed touch-input intents and game-session step/pause/resume seams with review baseline `6a0b3e1`. Game-flow tests use real input and real matches rather than internal mocks. Core movement/bomb/chain checks remain unchanged.

Themes, skins and the complete canvas flow are implemented. **M / 返回菜单** exits from play, pause or result; Escape cancels preparation. Returning retains appearance and seed; N chooses a fresh seed. Each retry/return releases run-owned views, inputs and event cursors while application images stay cached. See the [flow contract](docs/game-flow.md) and [lifecycle validation](docs/validation/issue-14-game-flow.md). The user completed #7's initial physical touch checks on Android + Edge: simultaneous movement/bombing, interruption during held input, manual resume without unintended actions, and dragging/turning without obvious mis-taps. Device-wide performance, browser coverage and final feel tuning remain #16's scope.

## Built-in themes

Choose 糖果乐园 or 玩具工厂 on the canvas before starting. R retries the current theme and initialization; N changes the seed and returns to selection. V or the top canvas button switches Normal / Entities from the current world without resetting the match or replaying events. Required resources are validated before gameplay creation; optional decoration failures are diagnosed and omitted. See the [private pack contract and error/cancellation demonstrations](docs/builtin-themes.md) and [validation evidence](docs/validation/issue-12-themes.md). Regenerate the original SVG artwork with `pnpm art:themes`.

## Visual and sound feedback

Issue #15 uses the user-selected stronger arcade sample: directional live-danger strokes, local impact rings, candy confetti / wooden fragments, and short explosion, break, pickup and elimination cues. Gains appear briefly in actor side cards. Menu and pause buttons adjust volume and particle budget; reduced-motion preferences suppress debris. Feedback consumes ordered events once and never changes gameplay randomness, danger windows or results. See [the feedback contract](docs/feedback.md) and [validation](docs/validation/issue-15-feedback.md). Run `pnpm art:feedback` to regenerate the original audio.

## Mobile acceptance in progress

Open `/?acceptance=1&seed=issue16-baseline-c` for local-only performance recording and report export. The user-confirmed target is OPPO Find X8 / Android 17 with Edge, Chrome and DuckDuckGo; each needs real-device evidence. A formal sample retains the 17×15, 1v3 defaults and requires 60 continuous foreground seconds. See [the procedure](docs/mobile-acceptance.md) and [pending device matrix](docs/validation/issue-16-mobile-acceptance.md). Desktop and simulated viewports do not close #16. `pnpm benchmark:match` reproduces the independent desktop rule workload.
