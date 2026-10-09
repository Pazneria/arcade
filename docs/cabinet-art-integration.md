# Cabinet craft and clearance pass

Unpublished derivative based on `0c771736020c8e21135b3342b4f67be6741b038d`. Work lives in the isolated `arcade-art` clone on branch `art/cabinet-craft`. The deliverable is a portable patch for parent integration. No merge, deployment, credentials or settings changes were performed. No browser, server, native UI, WebGL or GPU session was started.

## Result and art decisions

The cream title/action rectangles were separate planes standing in front of each cabinet's lower face. They duplicated the game names already on the cabinets and obscured stripes and hardware. Those six planes/textures are removed. Identity now belongs to the backlit marquees and painted side shoulders. The existing control labels, manufacturer badges, coin-door lettering, bezel instructions, CRT attract loops, side illustrations, scuffs and original cabinet silhouettes remain. The six identities and catalog order remain RaceGPT, OSRS Clone, Sword Guys, Ghost Signal, Night Courier, Rebound Relay.

The title system uses warm cream on dark ink, the cabinet family's existing accent colours, and a common fine metal-like border. Each game has a specific treatment: italic speed lettering and racing rails; a gold serif OSRS lockup and faceted medallion; broad serif Sword Guys lettering and blade/wave ornament; monospaced Ghost Signal and signal traces; italic Night Courier with street routes; condensed Rebound Relay with relay rings. The feature title follows the physical arch rather than a rectangular sign. Glyphs fit by font size, without horizontal squeezing. Canvas aspect follows the physical receiving panel; the side UV's unequal metre/pixel scales are corrected. Local font fallbacks introduce no font requests.

The bench has four eased seat slats, three tilted back slats, rear supports, a welded stretcher, small brass fixings and rubber feet. It reuses the existing wood, brushed metal and gold materials. The plant has a lathed terracotta belly, rolled rim, inner wall, soil, saucer, eleven tapering folded leaves, stems and raised centre veins. Three leaf forms share geometry. Both remain static, participate in the existing material merge, and use the existing soft contact-shadow texture. Actual solid bounds fit the original bench and plant colliders; shadow planes extend softly beyond them.

## Integration boundary with the door/interaction work

New art ownership is `assets/arcade-art.js`. The only runtime edits outside it are in `assets/arcade-scene.js`:

| Scene seam | Exact purpose |
| --- | --- |
| Module header | Import `CABINET_LAYOUT`, `paintMarquee`, `paintSideSignature`, `buildLoungeProps` |
| End of `addGameAnchor` | Remove only the cream label creation/plane; anchor, hit volume and target registration are unchanged |
| `marqueeTextureRaw`, `marqueePanel`, feature header's `mt` | Paint the new title art and use receiving-panel aspect |
| End of `sideArtTextureRaw` | Paint shoulder lettering into the existing canvas |
| `cpoTexture` cache key | Share the identical OSRS/Night control overlay, whose art has no game-title text |
| Bench/plant block in `buildProps` | Call art builder; keep the same two collider rectangles |
| Bank placement in `build` | Use the layout table below; existing transform-based anchors/colliders are still derived after placement |
| Wear spots and two bank-light positions | Follow moved cabinet centres; light count/intensity, materials and animation policy stay unchanged |

`buildEntrance`, `addExitAnchor`, the rear EXIT block, shell/door geometry, controller, motion, app, catalog, navigation, entry bootstrap, projection and default pose are untouched. Do not replace the owner's whole scene file: apply the focused hunks or port these seams into its new door branch. The owner's interaction changes may touch `addGameAnchor`; retain its metadata/logic and remove only the former art card. The bench/plant hunk ends before the fire extinguisher and rear EXIT construction.

Spacing requires the owner's new station/collision/inspection work to consume these world positions rather than old hard-coded z values. Game IDs/order and yaw stay stable. This branch automatically derives existing anchors/colliders from the moved objects and passes approach-ray and swept-walk checks.

| Index / game | Cabinet centre z, old → new | Approach x, z | Yaw |
| --- | --- | --- | --- |
| 0 / RaceGPT | -4.00 → -3.65 | -1.68, -3.65 | +π/2 |
| 1 / OSRS Clone | -4.68 → -4.92 | -1.68, -4.92 | +π/2 |
| 2 / Sword Guys | -6.50 → -6.10 | +1.70, -6.10 | -π/2 |
| 3 / Ghost Signal | -7.28 → -7.55 | +1.70, -7.55 | -π/2 |
| 4 / Night Courier | -5.36 → -6.19 | -1.68, -6.19 | +π/2 |
| 5 / Rebound Relay | -9.25 → -9.25 | 0, -7.70 | 0 |

The left shells now have 0.63 m between them, compared with 0.04 m. Their existing collider gap is 0.61 m, enough for the existing 0.54 m player diameter. Right control decks previously overlapped by 0.06 m; now they have 0.61 m clear space (0.69 m between their existing collider rectangles). The centre aisle stays in the same room envelope. The left Night/Fizz gap remains a side separation, not an additional through-route; the middle aisle and all game approaches are the tested walking routes.

The homepage bridge and `default-entry-v1` pose remain byte-for-byte/CPU pinned. Art changes the room visible at that pose, so parent publication must coordinate a replacement `/assets/images/rooms/arcade-entry.jpg` and its capture/hash record after rendered acceptance. Do not change the pose or bootstrap to accommodate the art. Until recaptured, the previous image will depict the old title art and spacing. No homepage files or preview images were edited here.

## CPU accounting and validation

`npm test` includes the new art audit, uses the recorded pinned baseline without requiring Git history, and still runs the existing route, movement, controller, loading, bridge, archive and fixture checks. `node scripts/test-arcade-art.js --compare-base` also constructs the exact ancestor from Git for a fresh comparison. Set `ARCADE_ART_RECEIPT` to a file path to save its report. Both are CPU-only. The new test checks solid prop footprints, all six marquee identities, removed duplicate-card textures, the centre aisle, each lateral approach and passage through both left-bank gaps with the production collision radius. Existing scene tests check every approach ray and disposal. No arbitrary new quality cap was introduced.

| Structural resource | Base | Art | Change |
| --- | ---: | ---: | ---: |
| Visible scene meshes | 163 | 157 | -6 |
| Static material merge buckets | 152 | 146 | -6 |
| Materials | 162 | 156 | -6 |
| Triangles | 63,249 | 66,415 | +3,166 |
| Procedural textures | 79 | 72 | -7 |
| RGBA base levels, bytes | 97,943,552 | 93,082,624 | -4,860,928 |
| RGBA with mip levels, bytes | 130,581,132 | 124,097,884 | -6,483,248 |
| Retained render geometry arrays, bytes | 5,824,716 | 6,128,652 | +303,936 |
| Lights / colliders | 11 / 20 | 11 / 20 | unchanged |

The extra triangles buy rounded bench joins, pot profile, folded leaf silhouettes and veins. They cost about 0.29 MiB of render geometry arrays; removed cards, correctly sized marquees and a shared overlay save about 6.18 MiB of RGBA mip storage. There are no new textures for the props or side lettering, lights, shaders, transparent effect planes or per-frame animators. One small local ES module adds one dependency request; no external assets, raster downloads or fonts are added.

Counts are structural CPU evidence. RGBA accounting sums each procedural canvas and floor-halved mip level; it excludes the unchanged PMREM environment target, driver alignment, pipeline/shader storage and browser Canvas2D backing-store overhead. Mesh counts do not measure frame draw calls, culling, fill rate, frame time or device memory. The overall room still has a substantial existing texture footprint; this pass does not claim to solve all room performance costs.

`assets/arcade-art-manifest.json` contains the LF-canonical module SHA256/byte manifest, procedural texture dimensions, solid bounds, layout and resource receipt. Original source/provenance, packaged Three.js, frozen archive and all saved versions are untouched and their hash checks pass. After integration, refresh the combined scene's `art` counts and scene-module hash in the manifest; tests require the accounting to match the built scene. Keep this isolated-art receipt for the original comparison. Resource deltas are reported, not used as quality caps for the new door work.

## Visual evidence and remaining acceptance

The accompanying delivery folder has software Canvas2D proofs of the actual procedural marquees/side artwork and CPU flat projections of the actual bench/plant geometry. Those were inspected for letter fit, palette, silhouette and joins. They are explicitly labelled CPU evidence and are not scene screenshots. They use the installed Windows font environment; fallback typography still needs inspection on the supported browser/device set.

Parent must grant an exclusive graphics slot before room inspection: default entrance composition; readable lettering while walking and at every approach; physical arch clipping, bloom/glare and side UV direction; plant/bench materials under the room's real lights; desktop and portrait clearances; all six interactions and both new sliding doors; unchanged transition pose with the refreshed homepage capture; resource disposal and a matched baseline GPU/frame-time check. This patch is ready for integration and rendered review, not visual acceptance or publication.
