# #12 Built-in themes validation

Date: 2026-10-16. User confirmed resource preparation/cancellation/cache and semantic slot resolution as the new behavior-test boundaries, plus existing match operations for theme independence. Review baseline: `7693bcf`. User selected **糖果乐园 + 玩具工厂**.

## Implementation

- Private manifest/slot/animation/reference-size/anchor contract: [built-in themes](../builtin-themes.md).
- Original deterministic SVG atlas, accent and preview artwork; no external assets. All existing semantic objects have required slots; characters are temporary bodies pending #13.
- Canvas selection, preparing, cancel and error states precede gameplay creation. Application image cache survives retries and scene changes. Cancelled/superseded identities cannot create a match after late IO.
- Normal/Entities reads one current world. Shared HUD/event cursor survives board reconstruction. No rule or implementation-version changes.

## Automated evidence

`tests/resources.test.ts` has 18 behavior cases: delayed preparation commit; immediate cancellation; supersession; failed-load retry and successful cache; missing required slots; optional-load diagnostics; five invalid frame/reference/anchor definitions; animated slot resolution; immutable snapshots without freezing caller data; shared in-flight IO; decoded size mismatch eviction; optional resolver omission; and two built-in themes with identical per-tick worlds/events through movement, bombs, explosion, destruction and result. Image IO is the external fake; the real public match runs in the comparison.

New contract behaviors were run red before implementation. Typechecking and this focused file were checked incrementally. Final `pnpm check` passed: all three TypeScript checks, **258 tests / 14 files**, architecture check (**14 core files**) and core/browser builds. The existing Phaser bundle-size warning remains. Impeccable detector returned `[]` for the changed browser target.

## Browser evidence

Actual Phaser/Vite browser, 1280×720 desktop and 844×390 landscape viewport (simulation, not a new physical Android acceptance):

- Both atlas SVGs decoded at their declared sizes and started the selected theme. Candy showed walls, wafer obstacles, actor bodies and chocolate bombs. Factory showed studded blocks, boxes, three pickup shapes and actors. Generated 17×15 map remained inside the board and controls.
- Factory item arena: ordinary Up/Right input picked range up from 1 to 2, leaving two items. Pause/resume remained functional.
- Paused view comparison: tick **971**, consumed events **1**, player **(1.500, 1.500)** and **1 bomb** stayed identical after switching Normal → Entities. Switching back used current facts. Escape arena reached tick **202**, **0 bombs**, **2 hazards**, **4 consumed events** after normal progression.
- R recreated the same escape seed and theme, reset the view to Normal and restored two initial bombs. N changed to a new generated seed, returned to selection and allowed choosing Factory.
- Required failure (`?resourceError=required`) showed “无法开始本局”, image-specific error, retry and return controls, with no gameplay tick created.
- Delayed load (`?loadDelay=2500`) cancelled with Escape; selection and “准备已取消” remained after late completion, without a gameplay tick.
- Optional failure (`?resourceError=optional&arena=items`) started with three items, retained an `accent` diagnostic and showed “装饰缺失，已省略”.
- Ordinary final generated Factory page had no browser error logs. Missing-image diagnostic routes intentionally produce load errors.

Local captures (ignored artifacts): `.impeccable/review/selection.png`, `desktop.png` (Candy escape arena), `mobile.png` (Factory generated map), `.scratch/theme-required-error.png`, `.scratch/theme-cancelled.png`. Each was opened/inspected as part of capture. Desktop and landscape confirmation corrected the view-toggle/ability-label spacing and optional diagnostic placement.

## Reviews

Implementation commit: `ff26fca`. Independent parallel reviews used `git diff 7693bcf...HEAD`: **Standards 0 findings**, **Spec 0 findings**. Standards checked repository agent guides, glossary, all four ADRs, README and the Fowler smell baseline. Spec checked #12 and #2 with the confirmed theme direction and test seams. Neither reviewer identified an actionable defect.

Fresh-context visual finish review returned **ship** over all three required captures, optional failure/cancellation captures and sampled source. Its persistence, fidelity, ceiling, material_fixes and keep sections reported no material fixes. This is screenshot/source review of the extension; timing, cache and rule independence rely on the separate behavior/browser evidence above. The documentation handoff compared the incumbent and finished extension as recorded below.

## Limits

This is a small original vector-art set, not final animation or audio production. Character skins and attachments remain #13. Menus are canvas-only and support keyboard selection; mobile evidence is viewport simulation. Cancellation detaches a task without aborting shared image requests. The format is private, with no arbitrary imports or hot theme replacement inside a match.

Design documentation verification compared the selection, desktop and landscape captures above with the incumbent browser composition and Entities View at `7693bcf`, the current `main.ts`, `theme-scene.ts`, `match-view.ts` and `normal-board.ts`, the built-in catalogue and deterministic artwork script, and the contract in `docs/builtin-themes.md`. The dark-teal canvas chrome, control layout and Segoe UI / Microsoft YaHei font stack remain consistent; Candy's frosting, wafer and chocolate and Factory's studded blocks, cardboard and metal are confined to the theme visuals. No material documentation mismatch was found. This ordinary extension establishes no new project-wide design tokens or brand commitments; existing design-system files are preserved.
