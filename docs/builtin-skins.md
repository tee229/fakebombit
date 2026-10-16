# Built-in character skins, private format v1

Issue #13 adds **薄荷兔** (`mint`) and **珊瑚机甲** (`coral`), independently selectable with either map theme. The chosen skin applies to this match's actors; P / AI / numbered labels preserve their identities. R retains skin, theme and initialization; N retains the selections and opens the chooser for a new seed. Left/right selects the theme; up/down selects the skin. Canvas panels support pointer selection.

The user cancelled hats on 2026-10-16. This release has no attachments, attachment anchors, attachment transforms or attachment occlusion requirements. A sprite's ordinary origin positions the body; it is not an attachment anchor.

## Resource contract

`SkinPackage` declares `format: builtin-skin-v1`, an ID, label, required image manifest, and `animations[action][direction]`. Actions are `idle`, `move`, `eliminated`; all four directions (`up`, `right`, `down`, `left`) are required. Each clip provides frame indices, positive FPS, loop mode, explicit `flipX`, reference size, body origin and display offset. `facing: none` on the underlying visual definition means it does not itself rotate the sprite; the outer direction key and `flipX` select its facing.

Idle and move loop; eliminated must not loop. All frames must fit the atlas. Invalid actions, directions, images, timing, origin, size or mirror declarations block preparation before gameplay creation. `withSkin` composes the selected skin with a theme; existing application caching, validation, cancellation, texture setup and failure feedback cover both. Definitions are copied and frozen without freezing author data. This is a private built-in format, without external imports or in-match skin replacement.

`src/resources/builtin-skins.ts` defines two 512×384 SVG atlases containing 48 frames of 64×64. Down, right and up occupy blocks of 16 frames; left explicitly mirrors right. Within each block:

| Action | Local frames | Playback |
| --- | --- | --- |
| Idle | 0–3 | 4 FPS, loop |
| Move | 4–9 | 12 FPS, loop |
| Eliminated | 10–15 | 12 FPS, once (0.5 seconds) |

Reference size is 64×64; the body origin `(0.5, 0.8125)` is at reference y=52. Offset `(0, 16)` places this foot reference 16 reference pixels below the logical position. Every direction/frame uses this convention. Gait, breathing and squash are baked into frames. Images and origins never determine collision, speed or damage.

Run `pnpm art:skins` to regenerate the original atlases and menu portraits under `public/skins/`. The deterministic vector script extends the existing vector artwork system; no external art, hats or skeletons are used. Map preview illustrations remain theme previews; the separate skin row shows the selected character.

## Playback ownership

`resolveSkinAnimation` samples a validated clip and exposes its frame/index, mirror, origin, offset and completion. `createSkinPlayback` reads actual world snapshots and owns a per-match presentation clock. Actual movement selects move; stationary actors idle and retain their last moving direction. Pushing a wall does not create gait animation. New actors default to down.

Phaser Sprite animations play the clips. Pause freezes them and the presentation clock. Terminal results freeze living poses and all gameplay immediately, while a newly observed elimination can finish its 0.5-second presentation. Completed or already-dead actors do not replay elimination. The clock survives Normal / Entities board reconstruction; retry creates a fresh clock. Animation completion has no rule callback. Hidden pages do not advance presentation time, and render delta is bounded to 100 ms.

`prefers-reduced-motion` uses the first pose of each action/facing instead of gait, breathing or squash. Elimination remains legible as a static pose then disappears after the same short interval. Essential gameplay movement remains continuous. Physical-device performance and media-preference testing are not claimed here.

## Demonstrations

Run `pnpm dev`, choose theme and skin, then Enter. `?arena=training` provides a controlled board: at the initial position, right/left and down/up demonstrate facing; leave a bomb and remain in its rays to observe immediate defeat followed by elimination. P pauses, Enter resumes, V switches views, R retries.

`?resourceError=skin` deliberately fails the selected skin atlas after loading the theme: no gameplay tick is created. `?loadDelay=2500` enables cancellation during preparation. Remove diagnostic parameters and reload for ordinary play.
