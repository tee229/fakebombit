# Event-driven feedback

Issue #15 extends the established candy/factory artwork. The user chose sample **B: stronger arcade feedback** on 2026-10-17: local impact rings, candy confetti or wooden/metallic fragments, and short coordinated sound cues. There is no screen shake. The sample and sound previews are recorded in `.scratch/feedback-samples.html` and `.scratch/issue-15-samples.jpg` (ignored local artifacts); no new permanent visual identity is implied.

## Public interface and ownership

`createFeedback(initialWorld, settings)` creates run-owned presentation history. `present(world, events, deltaMs, { paused, visible })` accepts real immutable snapshots and ordered events, returning newly consumed events, one-shot sound cues, aged effects and current directional danger cells. It never advances a match, reads clocks, draws random values or calls rule callbacks. `configure` changes volume, particle budget and reduced-motion behavior. `dispose` clears effects and is final. The user confirmed this testing seam and review baseline `56a9ef8`.

The `(tick, order)` cursor consumes every gameplay event once. `MatchView` uses these accepted events for its existing text history too. Normal / Entities board replacement retains the same history. Entering Entities clears transient effects and suppresses new effects/sounds while consuming history, so returning to Normal cannot replay them. Paused frames freeze presentation ages and silently consume any supplied events. A retry creates a new module and cursor.

Hazard cells come exclusively from `world.hazards`; their deduplicated cardinal connections draw directional light strokes inside those cells. Normal fire sprites still follow those same current hazards. Removing fire removes its danger overlay immediately, even if a few pastel/wooden fragments remain. The explosion impact ring also requires real fire. Fragments are sparse dots or rectangles, with no residual flame silhouette. Effects and sprite size never enter collision or damage calculations.

Explosion impact lasts 240 ms; destruction and elimination accents last 450 ms; pickup rings and side-card gain labels last 1000 ms. A terminal rule snapshot stops gameplay immediately while these short effects and the existing skin elimination clock can finish. Presentation delta is provided by the browser and bounded to 100 ms per frame; background/pause freezes it. No tween completion affects gameplay. The existing result overlay remains immediate.

## Budget and controls

At most 32 transient effects and 6 sound cues per frame are retained; elimination/pickup sounds have precedence in a dense chain. The default live particle budget is 96. Menu and pause buttons cycle rich 96 / lean 32 / off 0; the public interface accepts integer budgets 0–256. Changing budget may discard particles, never gameplay facts or pickup gain labels. `prefers-reduced-motion` removes all debris and spatial expansion while retaining static rings, live danger and text gain feedback.

Volume defaults to 45%; buttons cycle 75%, off, 25%, 45%. The interface accepts finite volume 0–1. Settings belong to this application session and survive retry/new/return; they are not persisted to browser storage. Invalid settings fail atomically. No presentation setting affects the match seed or its streams.

`FeedbackAudio` uses optional built-in PCM WAV files loaded by Phaser. Each run owns at most eight voices. Missing/locked sound is skipped immediately and never queued for unlock; Phaser handles the initiating gesture. Completion destroys voices. Pause, switching to Entities, changing volume and leaving the run destroy current voices, so resume does not replay an interrupted cue. Application decoded audio stays cached. See [original audio authoring](../public/audio/README.md) and `pnpm art:feedback`.

## Evidence

See [validation](validation/issue-15-feedback.md). Desktop browser playback/decoding and canvas checks do not establish mobile speaker loudness, physical multitouch performance, or device-wide audio lifecycle coverage; these remain #16.
