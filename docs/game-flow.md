# Game flow

Issue #14 moves business transitions into `createGameFlow` in `src/game-flow/index.ts`. It runs without Phaser and exposes frozen state through `read()` and `advanceFrame(deltaMs)`.

| State | Transition |
| --- | --- |
| `menu` | Select appearance, start preparation, or choose a fresh seed |
| `preparing` | Success mounts one run; cancellation returns to menu; failure enters `failed` |
| `playing` | Session results enter `result`; manual/background pause enters `paused` |
| `paused` | Explicit resume returns to play; retry/new/return remain available |
| `result` | Rules stay frozen; retry/new/return remain available |
| `failed` | Retry preparation or return to menu |
| `disposed` | Terminal application teardown; pending work cannot revive it |

`select` only accepts menu/failure changes. Theme and skin selection are fixed for each run. UI/theme appearance mode is presentation-only and can switch within the prepared theme without replacing the run. `retry()` reuses the complete immutable initialization record, including rule, actor, generator and random-stream starting data. It creates a new run ID, input and session. `newMatch()` calls the browser seed adapter and returns to selection; `returnToMenu()` retains the current seed and appearance. Diagnostic item/escape arenas repeat their deterministic preparation from the original initialization.

The flow injects image preparation, match creation, fresh-seed selection and `mountRun`. A mounted presentation returns `dispose`, `pause`, and `resume`; it never decides business state or results. Leaving a run clears input and disposes presentation once. The browser adapter removes its keyboard and pointer listeners, releases pointer capture, destroys view/control containers, stops sound instances and discards the view's event cursor and skin clock. One Phaser scene hosts this flow; its shutdown disposes the application flow rather than choosing an outcome.

Application resources live in `src/browser/app-resources.ts`. Successful and in-flight image promises and installed sprite sheets survive run disposal. Cancellation may let shared image IO finish and populate the cache, but preparation identity and flow generation checks prevent an obsolete completion from mounting or changing current state. Texture installation and required validation happen before gameplay creation. Failed images are evicted for a real retry.

Background pause clears input and freezes the session; background entry while preparing latches a pause for the ready run. Returning does not resume automatically. Explicit resume discards the first elapsed frame. The browser also requires visibility and focus for manual resume. A result stops rules immediately, while the existing view may finish a brief elimination presentation. Switching Normal / Entities only rebuilds the board, preserving run identity, input, gameplay and event consumption.

Accessible DOM buttons cover theme/skin choice, preparation cancellation, failure recovery, pause/resume, result, retry, new match and return. Keyboard equivalents: Enter to start/resume, Escape to cancel preparation or pause, P to pause, R to retry, N for a new seed, M to return, V to switch view. HUD abilities remain in side cards; time stays above the map or in the left rail on short landscape screens. Settings use a modal dialog, pause and clear input before opening, and require manual resume after closing.

Tests use the user-confirmed public flow and resource preparation interfaces, with real matches/sessions/input and injected image IO/presentation adapters. See [validation](validation/issue-14-game-flow.md). Issue #15 connects [event feedback and sound assets](feedback.md) to these lifecycle hooks; physical-device coverage remains #16.
