# Standing screen readability refinement

The integrated review of host `f472c95d80daf453c6e237ba549f085b04bd248f` supersedes the first flat512px review. At the actual standing fixture, the physical screen occupied roughly140×174 pixels. The original20–30px texture copy was difficult to read. Its earlier screenshots and review reports are preserved as evidence of that version; they do not establish physical typography acceptance.

The existing pixels inspected were the integrator's `cabinet-return-review/01-standing-physical-menu.png` and `02-selected-track.png`, with the findings in `arcade-cabinet-craft/docs/cabinet-craft-rendered-review.md`. No new graphics or browser was launched for this source refinement. No camera, standing-eye position, FOV, cabinet/ray code, native game or token source was changed.

## Revised hierarchy

The physical screen now uses a portrait logical layout,960×1280. `draw` still accepts any supplied canvas dimensions; its normalization and the action bounds use the same logical design. At the observed standing footprint this restores more natural glyph proportions and dedicates most of the lower screen to useful actions.

- Keep the recognizable racing wordmark, checkers, silver procedural-car illustration and actual selected-course diagram.
- Display one large `TRACK A`–`TRACK D` heading, instead of four simultaneously detailed cards.
- Use large A–D choices; the selected choice has an amber fill and dark letter. Native accessible labels remain the canonical `Test Track A`–`Test Track D` names.
- Put Start/Enter in a full-width amber action. Keep loading/error/retry in that same hierarchy.
- Give W/Gas, A D/Steer and Space/Brake three large dedicated control columns.
- Keep Escape/Back, or Escape/Cancel while loading, in a separate full-width bottom target. Rapid Start activation still cannot hit Cancel.

The removed descriptions remain in canonical track data and documentation; no course is renamed or mechanic replaced. Model-ghost/path animation is still lightweight. Saving/settings behavior is unchanged.

## Type budget and CPU evidence

| Essential element | Old type | Revised type | Estimated em at174px projection |
| --- | ---: | ---: | ---: |
| Selected course | 23–27px |104px |14.1px |
| Direct track choice |27px plus20px hints |108px letter |14.7px |
| Start |52px |124px |16.9px |
| Enter |30px |72px |9.8px |
| Gas / Steer / Brake |24px |76px condensed |10.3px |
| Back |35px |84px condensed |11.4px |

These are em-size estimates, not measured physical glyph acceptance. Windows CPU font metrics confirmed Arial Narrow is installed. Space at76px measured246.4px and Brake at76px253.4px inside a272px column, leaving usable gutters. Selected Track C measured570.3px inside864px; Start516.7px inside864px. No new font or software was installed.

Focused CPU tests pass for navigation, shared normalized pointer regions, duplicate starts, cancellation/re-entry, stale ready/error completions, error/retry, disposal, immutable selection, and URL contract. New typography invariants require essential labels at least72px, selected-course labels at least100px, removal of simultaneous small card metadata, and separated Start/Cancel bounds. Optional boot tests and TypeScript checking also pass. The renderer and review harness pass JavaScript syntax checks.

## Integration handoff

Refresh only `src/cabinet/racegpt-menu.js` into the host's `assets/cabinet-menu/racegpt-menu.js`. `track-art.js` is unchanged. Existing API and six canonical action IDs are preserved. The host adapter already reads dynamic `getHotspots()` and native labels, so it can retain its canvas resolution and projection behavior.

| Target | Logical x,y,w,h |
| --- | --- |
| Course i,0–3 |48+222*i,588,198,120 |
| Start |48,740,864,184 |
| Back / Cancel |48,1176,864,80 |

Do not carry old hard-coded screenshot pointer coordinates into the revised review harness. Use current normalized metadata. `cabinet-preview.html` and `scripts/review-cabinet-menu.mjs` were updated for the portrait layout; future flat output goes into `evidence/standing-refinement` rather than overwriting previously saved images.

Direct messaging to integration thread `01a12227-1f79-77cf-8a23-0b85500500ff` was attempted twice and failed with a base-path transport error. The parent final handoff is the available coordination route. A newly cleared bounded integrated standing review is still required. The small-text failure is not marked acceptable, and revised physical readability is not claimed before that review.
