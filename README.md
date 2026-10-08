# Jordan's Arcade

The production hub is https://pazneria.github.io/arcade/. Games remain in their own repositories; this repository owns the entrance, catalog and navigation.

This separate production derivative adapts the completed **Claude12 / Starlite Arcade** scene. The original benchmark source remains untouched in [Pazneria/lab at 17170c4](https://github.com/Pazneria/lab/tree/17170c4f6210f2a93245e6a6cb94adcb1c6c0335/walkable-3d/entries/starlite-arcade-claude). [assets/arcade-source.json](assets/arcade-source.json) records the source SHA256 hashes, pinned repository commit, archive hash and exact locally packaged Three.js r169 dependency/license. The original configuration is recorded as “Claude (manual); exact version/effort unknown.” No original performance claim is adopted as measured evidence.

## Layout and current games

The source room spans x=-3.6…3.6 and z=-11…0 metres; its token/prize alcove extends right to x=6.3 between z=-4.9…-1.5. The entrance is at z=0; a separate rear EXIT door sits at x=-2.75, z=-11. Both doors return Home. The central aisle and feature cabinet's surrounding walkway remain open. Room proportions, alcove, props, lighting, cabinet silhouettes and procedural artwork are retained. Game titles identify the real destinations, and Night Courier adds a third left-bank cabinet.

| Catalog index | Game | Scene placement | Published launch | Guide |
| --- | --- | --- | --- | --- |
| 0 | RaceGPT | Left Volt-Tek at z=-4.0 | [/racegpt/](https://pazneria.github.io/racegpt/) | [/racegpt/wiki/](https://pazneria.github.io/racegpt/wiki/) |
| 1 | OSRS Clone | Left Volt-Tek at z=-4.68 | [/osrs-clone/](https://pazneria.github.io/osrs-clone/) | [/osrs-clone-codex/wiki/](https://pazneria.github.io/osrs-clone-codex/wiki/) |
| 2 | Sword Guys | Right Wavecrest at z=-6.5 | [/sword-guys/](https://pazneria.github.io/sword-guys/) | [/sword-guys/wiki/](https://pazneria.github.io/sword-guys/wiki/) |
| 3 | Ghost Signal | Right Wavecrest at z=-7.28 | Coming soon | — |
| 4 | Night Courier | Added left Volt-Tek at z=-5.36 | Coming soon | — |
| 5 | Rebound Relay | Feature cabinet at z=-9.25 | [/rebound-relay/](https://pazneria.github.io/rebound-relay/) | [/rebound-relay/wiki/](https://pazneria.github.io/rebound-relay/wiki/) |

The original six-entry order stays stable for `arcade:return-state:v1`. Local development retains RaceGPT at port 5178 and Sword Guys at port 5179. OSRS guide links retain `from=arcade` and `return=<arcade URL>` through the existing Codex link contract. Game progress storage belongs to each game and is untouched. Home `/`, Lab `/lab/lab-space/` and Library `/library/` match the published homepage navigation checked during integration.

## Controls and accessibility

Explore captures the mouse when supported. WASD/arrows move, Shift moves faster, C toggles crouch, R returns to the entrance, and E/click inspects the nearby object at the crosshair. Escape or Controls pauses and releases the mouse. Drag look works when pointer lock is unavailable. Movement stops immediately on released/cancelled inputs, blur, hidden page, inspection or the directory.

On touch devices, hold Forward/Backward, drag to look and tap a nearby cabinet. Inspecting a cabinet exposes native Play, Guide, Back, Previous and Next controls. Coming-soon entries have no launch destination. Games opens an accessible HTML directory; it also remains usable while loading or after WebGL/import/renderer/context failure. Directory game/guide links retain their new-tab behavior and `noopener`; their accessible names identify the destination and new tab. A JavaScript-disabled page includes all four playable game links.

The entrant's HUD, frame overlay, diagnostic keys, auto-resolution controls and original instructions are removed. The remaining overlays are website navigation, optional controls and game actions.

## Scene boundary and resources

`assets/arcade-catalog.js` owns IDs, descriptions and destinations. `arcade-navigation.js` owns bounded, one-hour session restoration and disposal-before-navigation. `arcade-app.js` connects native links and page state. None of these owns room geometry.

`arcade-scene.js` creates geometry and exposes `{ scene, camera, colliders, anchors, targetMeshes, animate, dispose }`. Game anchors provide `id`, `kind='game'`, `gameIndex`, world `position`, collision-free `approach`, and `yaw`; door anchors have `kind='home'`. A future scene winner can implement this small boundary while retaining the catalog and routing. Invisible interaction volumes survive static merging; range and scene occlusion qualify the closest target. `arcade-controller.js` owns movement, pointer/touch input and a cancellable animation loop.

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

After the graphics slot is explicitly released, run `npm.cmd run test:browser` (optionally `BROWSER_CHANNEL=chrome`). The focused harness uses one browser, ephemeral local test hosting, test-only instrumentation and stub game destinations, then cleans up. Graphics, touch/keyboard interaction, visual parity and matched baseline frame-time measurements remain required before merge. The draft PR is held for coordinated testing and confirmation of route conflicts; no deployment is implied by CPU checks.
