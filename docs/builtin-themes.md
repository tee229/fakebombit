# Built-in themes, private format v1

Issue #12 supplies 糖果乐园 (`candy`) and 玩具工厂 (`factory`). This is a private source-controlled contract, not a public pack importer or a promise of format compatibility. Character bodies are temporary theme-colored markers; separate skins and attachments belong to #13.

## Contract

`ThemePackage` has `format: builtin-theme-v1`, nonempty `id` and `label`, a `resources` manifest and semantic `slots`. `src/resources/builtin-themes.ts` is the catalogue. Each image declares unique `id`, `url`, decoded `width`/`height`, `frameWidth`/`frameHeight`, and `required`. Dimensions are positive integers at most 4096 and must divide evenly into frames. Decoded sizes must match the manifest.

Each slot declares a resource ID, nonempty zero-based row-major `frames`, `framesPerSecond`, `loop`, `facing: none`, `referenceSize`, `anchor`, and `offset`. Multiple frames require positive finite FPS. Non-looping animations hold their last frame. Single-frame slots permit zero FPS. Animations advance by logical world time, not wall clock. Each reference size is positive finite; anchors are fractions in [0,1]; offsets are finite reference-pixel units. The logical cell center maps to the anchor plus offset. Reference dimensions determine display scale; texture dimensions never determine collision. This version has no directional animation convention: the bodies face the viewer.

| Required slot | Meaning | Atlas frame(s) |
| --- | --- | --- |
| `terrain.floor` | Ground | 0 |
| `terrain.solid` | Fixed wall | 1 |
| `terrain.breakable` | Destructible obstacle | 2 |
| `bomb.idle` | Current bomb | 3–6, 6 FPS, loop |
| `hazard.fire` | Current damaging cell | 7–10, 8 FPS, loop |
| `item.capacity` | Capacity pickup | 11 |
| `item.range` | Range pickup | 12 |
| `item.speed` | Speed pickup | 13 |
| `actor.player` | Living player placeholder | 14 |
| `actor.opponent` | Living opponent placeholder | 15 |
| `spawn.marker` | Initial spawn marker | 16 |

`decoration.accent` is optional, provided by a separate image. Built-in atlases are 512×192, with 64×64 frames; reference sizes are 64×64, centered anchors and zero offsets. Invalid or unloaded optional visuals are omitted with diagnostics. All required slots must reference required manifest images. Required definition, frame, image or size errors block creation; no invisible gameplay fallback is used.

## Ownership and boundaries

`visualSlotFor` maps semantic kinds to slot names. `resolveVisual` resolves a prepared slot to an image handle, frame and placement metadata. Neither requires Phaser. `createResourcePreparation` validates and snapshots a package, uses its injected image loader and exposes `start`, task identity, completion, and cancellation. A synchronous completion callback creates gameplay only after preparation succeeds. The browser installs sprite-sheet textures before calling `createMatch`.

The application owns successful and in-flight image promises, keyed by URL and frame/dimension metadata. Retry reuses them; failures are evicted. Cancellation ends the preparation immediately but does not abort shared image IO; a late image may populate the cache. Cancelled or superseded tasks cannot invoke their creation callback. The browser loader has a 10-second timeout. Page reload/HMR destroys the application cache; per-match objects and listeners are discarded on scene shutdown.

`ThemeScene` owns selection/preparation/error UI; `MatchView` owns HUD and the one event cursor. Normal rendering resolves current world objects into sprites. Entities draws geometric objects. V or the canvas toggle rebuilds only the board from the current world; neither resets the cursor nor replays events. Dead actors and expired/destroyed objects are removed from current facts. Fire animation exists only while its hazard exists, including the frozen final world. Initial spawn markers and optional corner decoration are visual only.

N generates a fresh seed and returns to theme selection. R prepares the same theme and recreates the same initialization, using the cache. Theme choice is fixed for each match. No rules, generator or gameplay implementation version changed.

## Authoring and demonstrations

Run `pnpm art:themes` to regenerate the original SVG atlases, optional accents and menu previews under `public/themes/`. The deterministic script is the source; no external art or fonts are required. Previews are optional menu illustrations and never authorize match creation.

Run `pnpm dev`, choose either theme and press Enter. `?resourceError=required` deliberately requests a missing atlas: the error page offers retry and return to selection. `?resourceError=optional` omits an accent, records a diagnostic and shows a canvas notice. `?loadDelay=2500` delays successful image delivery by 2.5 seconds per uncached image: press Escape or the cancel button; wait and confirm the selection page stays visible. These diagnostic URL parameters do not enter initialization or alter gameplay. Remove them and reload to restore ordinary loading.

`?arena=items` shows actual three-kind pickups; `?arena=escape` demonstrates current bomb/fire rendering; `?seed=<value>` uses the ordinary generated map. Use V while paused to compare the exact same current scene.
