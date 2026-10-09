# Standing cabinet interaction: source handoff

This is a craft exercise with acceptance criteria, not a scored benchmark. The implementation is local and unshipped. Focused integrated rendering/input review is complete; physical small-copy craft acceptance remains open. See `cabinet-craft-rendered-review.md` for actual evidence and limits.

## Provenance and integration

- Isolated checkout: `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\arcade-cabinet-craft`, branch `craft/cabinet-screen-lifecycle`.
- Preserved baseline: `e88a27f4d27d695d1f0e1b61faa3d0d207d5b9b5`, including the unshipped host polish after live `5feed14ca411bf4050f4df0cc7ba88c7bb7a9c75`.
- RaceGPT menu: `15dec9dd764d927c2b8d547d85fad5dc8d9c8fc9`, copied unchanged from task-30 into `assets/cabinet-menu/`. The game itself remains separate; the inspected optional bridge is applied and refined in the paired isolated `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\racegpt-cabinet-bridge` checkout. Its `docs/cabinet-start-integration.md` is the native source contract.
- Token entry: `651c25e1caacc98e9f2c6fc131149c3e91248f5c`, copied unchanged from task-31 into `assets/token-entry/`.
- Existing checkouts, frozen benchmark source/vendor, saved version archives, native game saves and localhost:5418 are untouched. No software installation, publication, merge, browser window or focus action occurred.

## Resulting interaction

Selecting a cabinet with E/ray or pointer preserves the current player's x/z and eye height. A head turn across the cabinet face keeps the screen and coin door in view. The camera stays at the player and retains FOV 70. Directory/browsing selection uses the existing safe standing approach; Back restores the original aisle pose. The menu uses the actual tilted screen's four projected corners. Native buttons and the Canvas2D drawing occupy that same projective plane, and hover mapping uses its inverse.

RaceGPT's four track choices use the menu worker's actual canonical track IDs. Arrow navigation and normal native button focus/activation work on the screen. The host keeps a larger persistent Back/browse/Guide control bar available as well. Generic cabinets have compact on-screen menus; coming-soon cabinets cannot launch.

Start creates one current launch session and one inert game document. The token is allocated lazily on the real existing coin-door frame at `[-.065,.085,.033]`, follows the original tilt/scale and is driven by the host's presentation loop. Its 0.92-second insertion and the current document load must both complete before input/focus is released. Reduced motion uses the worker's stationary 0.10-second acknowledgment with the same load barrier.

After insertion, gameplay opens in a deliberate, reversible play viewport without moving the cabinet camera. Fit to cabinet retains the same iframe and native game state. Narrow resizing keeps a usable play viewport and persistent Back. RaceGPT's paired bridge prepares the selected `?track=` course, reports engine readiness and waits for token completion. One host Start triggers the existing countdown, and a Started acknowledgment releases input. There is no redundant native title selection. Ordinary standalone RaceGPT entry retains its menu; generic iframe load remains a document boundary, not an engine-readiness claim. The host/native pair must be integrated together; the existing live game does not implement this new bridge.

Repeated Start shares one attempt; Escape/Back, menu Cancel, replacement, blur/visibility interruption and page disposal invalidate late work and remove the unused child document. A soft delay after ten seconds offers retry/back/full page. Error returns a retryable menu. A late successful document load cannot steal focus from a different host control. Returning focuses the scene before resuming mouse look and preserves the existing trusted-click pointer-lock and free-look fallback behavior.

## CPU evidence

`npm test` runs the repository checks plus focused session/menu/token tests, using event/Canvas recorders and real Three geometry without a browser, server, WebGL context or GPU session. Evidence is recorded in `docs/cabinet-craft-cpu.txt` and `docs/cabinet-craft-source-receipt.json`.

The focused checks cover both barrier orders, repeated Start, obsolete loads after cancellation/retry, failure/retry, focus movement during opening, normalized pointer round trips against real world screen points, unchanged standing camera/lens, input paused during menu animation, presentation-loop cleanup, native hotspot focus and actual menu renderer invocation. The token worker's 15 CPU checks are rerun in the integration tree, including geometry, parent transforms, clipping-shader structure, cancellation and disposal.

The original art still constructs 184 visible meshes, 66,514 triangles, 149 static merge buckets, 78 procedural textures and 31 colliders before lazy token attachment. `arcade-art.js` is unchanged; only the scene source hash in the derived art manifest is refreshed for the added attachment metadata. Saved-version SHA256 checks and the canonical room-handoff checks pass. These are structural/source measurements, not frame-performance measurements.

## Rendered review and remaining craft acceptance

The token worker completed and released its separately granted standalone slot. Subsequent source diagnosis commit `6aec942ccd09df71be96a123bd54d31bfb1c3445` confirmed a harness classification defect: falsy/unavailable queries were conflated with actual Boolean-false shader links. The original blank captures remain invalid visual evidence; shader compilation failure is unproven and context loss is an inference. The integrated production modules remain byte-identical to CPU commit `651c25e1caacc98e9f2c6fc131149c3e91248f5c`. The corrected diagnostic receipt is `docs/token-entry/standalone-graphics-diagnostic.json`; authoritative source diagnosis is `C:\Users\jmore\Documents\Codex\2026-10-09\task-31\token-entry\docs\token-entry\source-diagnosis.md`.

All three workers attempted the supported parent messaging route to `01a10ff2-2238-7405-b646-fd99c65d100b`; it returned `thread not found`. Worker-to-worker messaging worked while they were active. Final platform notification is the available handoff route.

The parent subsequently granted an exclusive integration slot of at most five minutes once CPU work was ready, after the title worker released its successful flat Canvas2D review. Two sequential bounded reviews used existing installed headless Chrome/SwiftShader after the expected cached executable was found missing; nothing was installed. Each used one owned browser and one disposable context, fulfilled only local candidate/native review-build GETs and blocked other traffic/writes. No windows or HTTP server opened and port5418 was untouched. Actual host/token links were true with visible output and no context loss. The second review passed after correcting the first harness's pointer-lock navigation assumption. Full cleanup completed at 20:24:14 UTC inside the granted bound. The slot is released. Raw results and all console/context records are archived in `cabinet-craft-evidence/`; the report distinguishes each run's scope.

Actual evidence includes standing physical menu/track and token screenshots, delayed opening/Escape/obsolete-load rejection, direct native RaceGPT countdown and real keyboard input, same-document resize/Fit/Back, resumed mouse look and normal Escape release, generic/coming-soon entry, source/browser/backend/viewport receipts and complete cleanup. Draw counts and a quiet console alone were not accepted as rendered evidence. Five useful images remain local because automatic approval review rejected their Library upload pending direct human authorization.

That short harness is explicitly targeted. It does not establish holistic arrival/discovery, one-minute sustained gameplay, physical mouse feel, GPU smoothness or whole-craft acceptance. The actual standing screen leaves the title worker's small track/control copy difficult to read; artwork-owner refinement remains necessary before considering that craft criterion complete. Direct messaging to the finished workers failed with an invalid turn/start response; parent platform notification must carry that request and the screenshots. No duplicate artwork edits or further graphics launches were made.
