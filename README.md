# Jordan's Arcade

The production hub is https://pazneria.github.io/arcade/. Games remain in their own repositories; this repository owns the entrance, catalog and navigation.

This separate production derivative adapts the completed **Claude12 / Starlite Arcade** scene. The original benchmark source remains untouched in [Pazneria/lab at 17170c4](https://github.com/Pazneria/lab/tree/17170c4f6210f2a93245e6a6cb94adcb1c6c0335/walkable-3d/entries/starlite-arcade-claude). [assets/arcade-source.json](assets/arcade-source.json) records the source SHA256 hashes, pinned repository commit, archive hash and exact locally packaged Three.js r169 dependency/license. The original configuration is recorded as “Claude (manual); exact version/effort unknown.” No original performance claim is adopted as measured evidence.

## Layout and current games

The source room spans x=-3.6…3.6 and z=-11…0 metres; its token/prize alcove extends right to x=6.3 between z=-4.9…-1.5. The entrance is at z=0; a separate rear EXIT door sits at x=-2.75, z=-11. Both doors return Home. The central aisle and feature cabinet's surrounding walkway remain open. Room proportions, alcove, props, lighting, cabinet silhouettes and procedural artwork are retained. Game titles identify the real destinations, and Night Courier adds a third left-bank cabinet.

| Catalog index | Game | Scene placement | Published launch | Guide |
| --- | --- | --- | --- | --- |
| 0 | RaceGPT | Left Volt-Tek at z=-3.65 | [/racegpt/](https://pazneria.github.io/racegpt/) | [/racegpt/wiki/](https://pazneria.github.io/racegpt/wiki/) |
| 1 | OSRS Clone | Left Volt-Tek at z=-4.92 | [/osrs-clone/](https://pazneria.github.io/osrs-clone/) | [/osrs-clone-codex/wiki/](https://pazneria.github.io/osrs-clone-codex/wiki/) |
| 2 | Sword Guys | Right Wavecrest at z=-6.10 | [/sword-guys/](https://pazneria.github.io/sword-guys/) | [/sword-guys/wiki/](https://pazneria.github.io/sword-guys/wiki/) |
| 3 | Ghost Signal | Right Wavecrest at z=-7.55 | Coming soon | — |
| 4 | Night Courier | Added left Volt-Tek at z=-6.19 | Coming soon | — |
| 5 | Rebound Relay | Feature cabinet at z=-9.25 | [/rebound-relay/](https://pazneria.github.io/rebound-relay/) | [/rebound-relay/wiki/](https://pazneria.github.io/rebound-relay/wiki/) |

The original six-entry order stays stable for `arcade:return-state:v1`. Local development retains RaceGPT at port 5178 and Sword Guys at port 5179. OSRS guide links retain `from=arcade` and `return=<arcade URL>` through the existing Codex link contract. Game progress storage belongs to each game and is untouched. Home `/`, Lab `/lab/lab-space/` and Library `/library/` match the published homepage navigation checked during integration.

## Controls and accessibility

Approach either Home exit to slide its panels open, then walk outward through the doorway to leave. E/tap and the website Home / Exit link remain available. See [the door contract and CPU checks](docs/sliding-exit-validation.md); rendered walking and appearance QA remain pending.

The scene opens directly after preparation, with keyboard movement ready. WASD/arrows move, Shift moves faster, C toggles crouch, R returns to the entrance, and E/click inspects the nearby object at the crosshair. A primary scene click requests pointer lock when supported. Loading, keyboard entry and focus recovery never request it. Escape or Controls opens help, pauses and releases the mouse. Back returns to the saved aisle pose and requests lock during its trusted click; Escape returns without recapturing it. Mouse movement over the scene works immediately after return, with drag look and deliberate click-to-lock also available. Touch retains deliberate drag. Movement stops on released/cancelled inputs, blur, hidden page, inspection or the directory.

The initial HTML contains a neutral dark loading cover, a small Arcade label and four thin stage segments. Labels reflect actual engine import, scene construction, graphics preparation and first-frame readiness. Each stage yields paint opportunities before synchronous preparation. There are no simulated percentages. The cover fades for 180 ms after the first successful render; reduced motion hides it immediately. Error states keep game links and a Retry loading button available. Retry releases resources and reloads the page so failed module imports can be fetched again. Navigation cancels pending frame/timer work and covers the removed canvas. See [drop-in loading validation](docs/drop-in-loading-validation.md) for CPU and rendered evidence and its limits.

On touch devices, hold Forward/Backward, drag to look and tap a nearby cabinet. Native Play, Guide, Back, Previous and Next controls appear on the cabinet's actual screen. Play opens one game document there, while Arcade's frame loop stays paused. Back, changing views, hiding the tab or leaving removes that game document; each game retains its own progress storage. Open full page remains available for more space. Coming-soon entries have no launch destination. Games opens an accessible HTML directory, including during loading or after WebGL/import/renderer/context failure. Directory links retain new-tab behavior and `noopener`, with accessible destination names. A JavaScript-disabled page includes all four playable game links. See [the screen contract, CPU evidence and pending rendered checks](docs/cabinet-screen-validation.md).

The entrant's HUD, frame overlay, diagnostic keys, auto-resolution controls and original instructions are removed. The remaining overlays are website navigation, optional controls and game actions.

An optional incoming homepage entry preview uses the pinned shared inline bootstrap. Valid one-shot entries hold the captured room image through preparation, bypass a remembered cabinet for that visit, and release keyboard input/focus after the matching default frame and cover fade. Ordinary entry retains the existing loader and restoration. See [the handoff integration and pending combined QA](docs/room-handoff-integration.md).

The draft [cabinet art pass](docs/cabinet-art-integration.md) gives the banks more clearance, integrates game lettering into the original cabinet surfaces, and rebuilds the entrance bench and plant. Its [asset and CPU cost manifest](assets/arcade-art-manifest.json) records the exact derivative modules and resource comparison. Rendered acceptance and matching homepage preview refresh remain parent-coordinated.

The [combined review candidate](docs/combined-arcade-integration.md) integrates that art with sliding exits and cabinet-screen interaction. It preserves the frozen art receipt and records the combined accounting separately. The prepared entry-capture helper is CPU-checked only; capture and publication await the parent's graphics slot.

## Scene boundary and resources

`assets/arcade-catalog.js` owns IDs, descriptions and destinations. `arcade-navigation.js` owns bounded, one-hour session restoration and disposal-before-navigation. `arcade-app.js` connects native links and page state. None of these owns room geometry.

`arcade-scene.js` creates geometry and exposes `{ scene, camera, colliders, anchors, targetMeshes, animate, dispose }`. Game anchors provide `id`, `kind='game'`, `gameIndex`, world `position`, collision-free `approach`, and `yaw`; door anchors have `kind='home'`. A future scene winner can implement this small boundary while retaining the catalog and routing. Invisible interaction volumes survive static merging; range and scene occlusion qualify the closest target. `arcade-controller.js` owns movement, pointer/touch input and a cancellable animation loop.

Optional `exits` state supplies sliding collision/threshold behavior. Each current cabinet also supplies a `screen` anchor for framing and native control placement. `arcade-cabinet.js` owns one game iframe and child-event cleanup, independently of geometry and catalog routing. A future scene without a screen anchor retains the accessible action panel fallback.

Repeated primitive geometry, identical static materials and deterministic textures are shared. Static meshes merge by material, while the original animated feature remains separate. Temporary environment geometry and the PMREM generator are freed after creating the retained environment render target. Same-tab game/guide/site navigation disposes the scene, textures, target, renderer, canvas, animation callback and input listeners before assigning the destination. `pagehide` also disposes; a restored cached page rebuilds one scene. Directory/hidden-page/controls/inspection states stop the frame loop.

Desktop pixel ratio is capped at 1.5 with a 2,304,000-pixel budget. Touch is capped at 1.25 with a 900,000-pixel budget and 30 fps rendering. These are initial limits for validation; they are not measured GPU guarantees. Texture upload happens once at initialization; attract loops use shader uniforms.

## Local development and checks

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run serve
```

`serve` runs on 5510 without opening a browser; `dev` opens the browser. Start local games separately. Never start a preview or graphics test during a benchmark resource hold. No server is required for the CPU checks.

`npm test` checks exact published/local destinations, guide safety and OSRS parameters, session bounds/expiry/storage failures, disposal ordering, normalized movement and thin-wall collision, valid anchors, dependency hashes and scene construction/disposal with real Three.js geometry and stubbed drawing/environment surfaces. Structural mesh/triangle counts are CPU evidence only.

After the parent grants a graphics slot, `npm.cmd run test:browser` runs the focused browser harness (optionally `BROWSER_CHANNEL=chrome`); `npm.cmd run test:rendered` additionally checks real loading/pointer-lock/retry/cancellation and captures live-main scene comparisons. Both use one browser, ephemeral local test hosting, test-only instrumentation and stub game destinations, then clean up. Bounded Chrome QA of the earlier published loading version passed on October 9, 2026; see [the evidence and limits](docs/drop-in-loading-validation.md). The derivative, loading flow and homepage entry bridge are live. These sliding-exit and cabinet-screen drafts await coordinated rendered QA; earlier results do not verify their appearance or browser behavior. Matched baseline frame-time/performance measurements remain pending.

## Saved versions

`versions/` provides side-by-side links and ZIP downloads for the previous production hall and the earliest surviving Arcade page. Every snapshot file and ZIP has a SHA256 record in `versions/version-record.json`; `npm test` verifies those bytes. The original 107-commit main history is retained. The remote tags `arcade-before-claude12-2026-10-08` and `arcade-earliest-2025-10-31` were pushed before publication.

The earliest page is a standalone October 31, 2025, “Games coming soon” placeholder. The previous hall includes its complete tracked source and cabinet images, but still loads Three.js and fonts from external services. The current derivative vendors Three.js and uses local JavaScript modules. Serve either 3D version over HTTP; no build is required. These snapshots preserve the Arcade website, while the separate games and their progress storage continue at their existing destinations.

To preview a tagged version separately, create a Git worktree at the desired tag and serve its root over HTTP. To restore production after this integration, make a forward revert of its merge commit with `git revert -m 1 <merge-commit>` and publish that revert through the normal PR flow. Neither method rewrites existing history.
