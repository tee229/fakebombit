# Event-driven feedback

Issue #15 extends the established candy/factory artwork. The user chose sample **B: stronger arcade feedback** on 2026-10-17: local impact rings, candy confetti or wooden/metallic fragments, and short coordinated sound cues. There is no screen shake. The sample and sound previews are recorded in `.scratch/feedback-samples.html` and `.scratch/issue-15-samples.jpg` (ignored local artifacts); no new permanent visual identity is implied.

## Public interface and ownership

`createFeedback(initialWorld, settings)` creates run-owned presentation history. `present(world, events, deltaMs, { paused, visible })` accepts real immutable snapshots and ordered events, returning newly consumed events, one-shot sound cues, aged effects and current directional danger cells. It never advances a match, reads clocks, draws random values or calls rule callbacks. `configure` changes volume, particle budget and reduced-motion behavior. `dispose` clears effects and is final. The user confirmed this testing seam and review baseline `56a9ef8`.

The `(tick, order)` cursor consumes every gameplay event once. `MatchView` uses these accepted events for its existing text history too. Normal / Entities board replacement retains the same history. Entering Entities clears transient effects and suppresses new effects/sounds while consuming history, so returning to Normal cannot replay them. Paused frames freeze presentation ages and silently consume any supplied events. A retry creates a new module and cursor.

Hazard cells come exclusively from `world.hazards`; their deduplicated cardinal connections draw directional light strokes inside those cells. Normal fire sprites still follow those same current hazards. Removing fire removes its danger overlay immediately, even if a few pastel/wooden fragments remain. The explosion impact ring also requires real fire. Fragments are sparse dots or rectangles, with no residual flame silhouette. Effects and sprite size never enter collision or damage calculations.

Explosion impact lasts 240 ms; destruction and elimination accents last 450 ms; pickup rings and side-card gain labels last 1000 ms. A terminal rule snapshot stops gameplay immediately while these short effects and the existing skin elimination clock can finish. Presentation delta is provided by the browser and bounded to 100 ms per frame; background/pause freezes it. No tween completion affects gameplay. The existing result overlay remains immediate.

## Budget and controls

At most 32 transient effects and 6 sound cues per frame are retained; elimination/pickup sounds have precedence in a dense chain. The default live particle budget is 96. The settings effects tab selects rich 96 / lean 32 / off 0; the public interface accepts integer budgets 0–256. Changing budget may discard particles, never gameplay facts or pickup gain labels. `prefers-reduced-motion` removes all debris and spatial expansion while retaining static rings, live danger and text gain feedback.

Sound-effect volume defaults to 45%; background-music volume defaults to 35%. The audio tab exposes independent 0–100% sliders. Settings survive retry/new/return and are persisted in `fakebombit-feedback-v1`; the existing `volume` field remains sound-effect volume, while missing `musicVolume` is filled with its default. Particle, appearance and control preferences are preserved. Operation reset changes neither volume. Invalid settings fail atomically. No presentation setting affects the match seed or its streams.

`FeedbackAudio` uses optional built-in PCM WAV files loaded by Phaser. Each run owns at most eight voices. Missing/locked sound is skipped immediately and never queued for unlock; Phaser handles the initiating gesture. Completion destroys voices. Pause, switching to Entities, changing volume and leaving the run destroy current voices, so resume does not replay an interrupted cue. Application decoded audio stays cached. See [original audio authoring](../public/audio/README.md) and `pnpm art:feedback`.

## Background music

Issue #20 explicitly adds the user-provided `public/audio/fbi-bgm.mp3`, superseding the earlier image-proposal constraint against unrequested music. `BackgroundMusic` owns one application-lifetime HTML audio element with looping enabled and metadata preload. It streams independently of Phaser's run-owned sound-effect voices and is released on scene shutdown/HMR. The provided file is unchanged; provenance and SHA-256 are in `public/audio/README.md`.

First pointer/keyboard interaction enables playback. Menu, preparation, play and result screens share the same track position; retry/new/return do not create another instance. Manual/background match pause silences music, closing settings leaves the match paused, and manual resume continues the existing position. Menu settings can play music while adjusting its volume. Hiding/leaving the page stops playback through the existing lifecycle boundary; returning to a paused match does not resume it. Muting either channel changes only that channel. Play failures are caught and retried on a subsequent user gesture or permitted foreground transition, without delaying gameplay or queuing event sounds.

Browser playback diagnostics are attached to the audio element (`data-background-music`, state, volume, position and duration); the pre-existing Phaser voice counters still describe effect voices.

## Evidence

See [effect validation](validation/issue-15-feedback.md) and [background music / independent volumes](validation/issue-20-audio.md). Desktop browser playback/decoding and canvas checks do not establish mobile speaker loudness, physical multitouch performance, or device-wide audio lifecycle coverage; these remain #16.
