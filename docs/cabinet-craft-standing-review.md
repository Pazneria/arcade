# Current standing-menu and return acceptance

The menu owner's portrait refinement `71a32a3b26df0aa6172ee9abe047573266527e8a` resolves the earlier small-copy concern at the actual tested standing view. The host camera keeps player x/z, eye1.62 and FOV70. Primary selected-track text, A-D choices, Start/Enter, driving hints and Escape/Back are readable in the inspected standing screenshots. Four real pointer targets and keyboard navigation were checked against their current normalized metadata. No host zoom, camera dolly or duplicate artwork changes were introduced.

The full revised-menu run used host `947d0fcdfd869fd98d5dd9ecf87ff19a8795d8d9` with native `6e0f47999e66742e0aac81ecd097f2ffc17c8ffa`; its preserved receipt is `cabinet-craft-evidence/standing-refinement-receipt.json` (`passed:true`). It covers all four course choices, Start focus, actual linked host/token shaders, visible token/slot pixels, delayed document cancellation and obsolete-load rejection, direct chosen-course countdown with keyboard driving, same-document resize/Fit, Back/mouse-look/Escape and repeated generic/coming-soon entry. There were zero browser page errors and no context loss.

Source review then found a real native return gap: the original Return to Arcade action would navigate Arcade inside the iframe. The paired native bridge now sends verified menu/back messages. Main Menu returns to the physical cabinet screen with the selected course retained. Return to Arcade removes the child and returns to the aisle. Ordinary standalone RaceGPT routes retain their native menu/return behavior. The host checks frame/source/origin/session/track and accepts these actions only after a started run.

The final return run used host `96bbdd91cbeaa90cbb51dc606e4ffa4f0f7a1d29` and native `b07203e139d086f15cd5894256a07c2aa9fd1bf1`. Its `cabinet-craft-evidence/native-return-final-receipt.json` is `passed:true`, recording actual mobile Pause→Main Menu→physical Track C menu→restart→Pause→Return to Arcade→resumed mouse look. It also covers the four course targets, real throttle/steering samples, moving-car speed, same-document resize/Fit and subsequent cabinet entry. This return-only variant deliberately relies on the earlier full revised-menu run for delay/cancel/token-link checks.

The intermediate `native-return-initial-receipt.json` remains `passed:false`. Both native return actions and restart had already succeeded, but its mouse-look assertion used desktop x800/840 coordinates outside the390px mobile viewport. The recorder now uses viewport-relative positions. The final run confirms the normal return path; the failed raw receipt is preserved rather than rewritten.

## Bound and cleanup

The parent granted up to five minutes of active rendering after Studio released its slot. Three sequential owned headless Chrome/SwiftShader run intervals were73.558,46.626 and61.091 seconds:181.275 seconds total. Source inspection, CPU checks/builds and commits occurred between runs with no browser active. All three receipts confirm independent cleanup. Final cleanup ended2026-10-09T21:01:44.277Z; process census found no owned Chromium or review-Node processes. The graphics slot is released and no more rendering is queued. No desktop windows opened/focused, existing profiles were not used, no software was installed, no HTTP server ran and port5418 was untouched.

## Review files and scope

Useful local images:

- `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\cabinet-standing-refinement-review\02-track-c.png`: actual standing screen and revised hierarchy.
- `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\cabinet-standing-refinement-review\03-token-in-standing-view.png`: unchanged token source at the existing door attachment.
- `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\cabinet-native-return-review-final\05-native-track-play.png`: real selected native course in play.
- `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\cabinet-native-return-review-final\06-narrow-play-viewport.png`: same native document at390x844.
- `C:\Users\jmore\Documents\Codex\2026-10-09\task-29\cabinet-native-return-review-final\07b-native-return-to-physical-menu.png`: returned physical menu retaining Track C on mobile.

These images were inspected locally. The earlier automatic approval rejection of Library upload remains in force; the parent explicitly instructed local preservation with no retry. No upload ran, and no Library IDs are claimed. The denied upload is the only delivery restriction remaining here.

This targeted fixture validates the reported standing typography and interaction routes. It does not establish natural arrival/discovery, one-minute sustained gameplay, physical mouse feel, GPU smoothness or acceptance at every distance/display scale. Each driving sample lasts12 seconds. Native physics, track/ghost data and save schema are unchanged. The camera, menu-worker assets, token ownership and standalone routes follow the documented contract. Source is local, unshipped and intended to be integrated as the host/native pair; nothing was published or merged.
