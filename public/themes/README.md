# Original built-in theme artwork

All six SVG files are original code-authored vector artwork for Fake Bomb It, generated deterministically by `scripts/build-theme-art.ts` (`pnpm art:themes`). No third-party images, fonts, raster generation or licensed sprite packs are used.

Candy uses frosting blocks, wafer obstacles, chocolate bombs, wrapped pickups and lollipop scenery. Factory uses studded blocks, strapped boxes, metal bombs, plastic pickups and a small cart. Both share readable item symbols, actor identity labels and full-cell danger coverage. Menu previews illustrate the corresponding atlas; required gameplay images are loaded and checked separately.

See `docs/builtin-themes.md` for the private slot/frame/placement contract. Change the script before regenerating the SVGs.
