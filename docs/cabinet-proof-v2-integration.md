# Approved proof-v2 integration

Jordan approved the revised still from `C:/Users/jmore/Documents/Codex/2026-10-09/task-43/proof-v2`. This branch combines that visual direction with private input correction `6ab7c061ea66b35409ca4e706860ffb8ed555a27`. Native pair: `../racegpt-cabinet-bridge` at `f29bae6c6df9d8b0e2c80a93193f1f7a10e32110`. The original rejected-art functional reference remains unchanged on its earlier branches.

The approved Course C PNG is copied byte-for-byte (SHA256 `3093f657363c7c7f21b9713e56935623c7cc5917e12b3cb81cc86ae5898204f2`). Its authored 992x1152 plane is31:36, matching the existing physical screen. Period type is bundled as raster pixels, so browser font fallback cannot enlarge or replace it. The cream/amber/burgundy palette, paired chamfered rules, route diagram, marker and PRESS START geometry retain the approved scale. No camera zoom or new screen boundary is used.

`scripts/build-cabinet-proof-v2.cjs` mechanically derives the other canonical course/selection variants from the supplied SVG and96-point route/gate data. It uses the producer's existing ImageMagick CPU route, not a browser or GPU. It adds no independent illustrations or typography. Course C stays the supplied bitmap. The only loading/error visual change is the existing prompt's same-size replacement with PLEASE WAIT or TRY AGAIN. Two shared127px prompt strips serve all four course bitmaps, avoiding full-screen state copies. These derived variants still require the final human/runtime review; approval of the original C still is not a claim that every state was reviewed.

The title renderer contract is `createApprovedCabinetArt({document,loadImage?}) -> {ready,draw,regions,focusAction,design}`. `draw(ctx,{width,height,state})` paints the selected course and optional status strip without font calls, timers or RAF. Artwork readiness is awaited before creating scene GPU resources. Failure uses the existing directory fallback; Escape during initial loading opens explicit keyboard help and invalidates late initialization. The host continues to own menu state, token readiness, presentation RAF and native game handoff. The earlier menu worker's immutable attempt/settings/controller API is reused unchanged; its rejected renderer is not used by the app.

Authoritative physical targets in992x1152 coordinates:

| Action | x | y | Width | Height |
|---|---:|---:|---:|---:|
| Course A |128|758|184|172|
| Course B |312|758|184|172|
| Course C |496|758|184|172|
| Course D |680|758|184|172|
| Press Start / Try Again |124|963|744|127|

There is no Leave or Cancel artwork/target on this attract screen. During loading the five stable native controls announce their unavailable state; Start remains focusable, but repeated activation cannot launch or cancel another attempt. Escape or clicking outside exits/cancels. Arrow left/right or A/D selects; native Tab and Enter remain equivalent. Physical joystick/button bindings are optional future work and are not claimed here. Shared target edges use explicit normalized right/bottom bounds; hover mapping and native actions resolve the same course.

Default loading, aisle and cabinet modes show no webpage navigation bars. Navigation is hidden/inert until explicit Help or directory/fallback mode. The removed cabinet browse/game toolbars do not return. Generic cabinet choices/recovery remain on their projected screen. The existing usable game viewport keeps the same document across resizing and no surrounding toolbar. Natural cabinet selection preserves the full camera pose; trusted outside/physical Back gestures may restore lock when permitted. Free window look remains available when capture is rejected. Delivered Escape never requests lock. The native pair forwards delivered keydown or keyup through its existing verified back message; browser-reserved events cannot be bypassed, so clicking the visible room margin remains the fallback.

`npm test` covers asset hashes/dimensions, exact C preservation, course/state painting, font-independent runtime, normalized targets, focus/repeat/error/cancel, initialization failure/help, scene pose/bounds/occlusion, pointer-lock races and rejection, stale loads, token/native barriers, same-document resizing, archive/link/handoff cleanup. The source-only rendered harness has been updated and parsed; no new browser, renderer/game runtime, server or GPU session has run. Existing screenshot receipts describe the frozen candidate, not this integration. Final rendered input/visual evidence awaits a coordinated parent slot; nothing is published, merged or installed and port5418 is untouched.

The art-owner message attempt failed in the local thread messaging interface (`invalid turn/start params`). The provided template, route data and notes were sufficient for this mechanical integration. The original designer notes are preserved in `cabinet-proof-v2-approved-notes.txt`; per-asset hashes live in `assets/cabinet-menu/proof-v2/asset-receipt.json`.
