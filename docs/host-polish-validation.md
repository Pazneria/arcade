# Experimental Arcade host candidate

Local branch: experiment/arcade-host-polish. Baseline: published PR48 merge
5feed14ca411bf4050f4df0cc7ba88c7bb7a9c75. These experimental changes are not
published. The coordinator cleared the exclusive graphics window on 2026-10-09.
The main pass ran 09:28:07–09:57:07 UTC, followed by sequential mobile and
bounded visual checks. All owned runtime resources closed and were checked.
Library localhost:5418 and other workers were untouched.

## Changes and independent review

Next/Previous retain keyboard focus; initial inspection still focuses the primary
action, and selected titles use a polite live region. The new regression check
fails on the exact live source, then passes with the candidate.

Game opening has visible status, a 10-second soft delay and retry, with persistent
Back/full-page controls. The opening iframe is inert; canceling removes its
listeners, timer and document. Obsolete loads cannot revive it. A current loaded
frame receives focus only if the page is visible/focused and the user stayed on
the opening control. Document load does not establish game-engine readiness.

The Games directory follows the measured navigation bottom, resets scroll/focus,
and offers View cabinet alongside preserved native new-tab Launch/Guide links.
Failure hides View cabinet and retains eight native Launch/Guide links.

Expand game / Fit to cabinet retains the exact iframe and native progress. It
resets on return and below 768px. The observed OSRS inventory/chat overlap at
620×720 is resolved at the expanded desktop size of 1673×749 in a 1707×923 window.
Repeated keyboard toggles and desktop/landscape/portrait resizing retained the
same document and profile with Arcade paused. Native expansion retests added
about 12 seconds of OSRS input and 4 seconds of RaceGPT input.

Independent review caught premature opening-frame focus in the initial candidate;
it was fixed and reviewed again. The final host review and separate expansion
review report no remaining material findings. Review used CPU/source inspection;
the owner performed the rendered checks below. The full 12-command CPU suite
passes, including browser-fixture syntax checks and meaningful opening/retry,
cancellation/focus, observer cleanup and exact-frame expansion assertions.

## Rendered pass

Chrome 154.0.8037.98 reported WebGL2 via ANGLE / Direct3D11 on NVIDIA GeForce
RTX 5070 Ti Laptop GPU. Fresh contexts ran sequentially in one owned background
browser at a time. Baseline used exact published Git blobs; candidate used the
isolated working files. Desktop comparisons used 1707×923 DPR1; portrait used
390×844. The separate mobile pass used 390×800 DPR3 and 800×390. No existing
user profile was attached. Outbound writes and unapproved destinations were
blocked; no game score, vote, account or benchmark request was made.

The live baseline reproduced second-Enter carousel launch, blank delayed game
opening and portrait navigation overlap (nav bottom 116px, heading top 95px).
The candidate retained carousel focus over twelve keyboard activations and put
the heading at 140px, 24px below navigation. All six menus were inspected.

Actual movement/pointer look discovered cabinets from the default entry. Both
physical Home exits were approached, retreated from and crossed with ordinary
inputs. Receipts show Arcade RAF/listeners at zero and one world/renderer
disposal before navigation. Browser Back restored one controller. Full-page
native game navigation and Back preserved selection/progress. Home/Lab/Library
were fixture destinations; those apps were not tested.

RaceGPT had about 67 seconds of accelerator/steering/braking input; Sword Guys
had about 60 seconds of movement/confirmation and entered another area; OSRS
Clone had about 60 seconds of camera/point-click play with a disposable Host QA
character. Arcade draw counts stayed fixed and its RAF was zero during play.
Back/Escape removed the frame; captured detached-game callbacks stopped. Native
progress keys persisted; the Arcade parent made no localStorage writes.
Rebound Relay was checked as a host menu/route fixture only, respecting its owner.

Gated document loading proved early Escape, delay/retry, single current-frame
ownership and no late focus theft after moving focus to full-page. Canceling
engine import left the directory with zero canvases; Return to 3D created one.
Import failure retained the native launch/guide fallback. Mobile CDP movement
stopped on release/cancel, drag-look did not activate a cabinet, and the guide
touch target fit 800×390. Mobile lifecycle, resize, failure and simulated
persisted-page restoration passed. Real browser Back reported persisted=false;
simulated BFCache coverage is explicitly separate.

## Visual comparison

Geometry, controller, art, catalog and navigation hashes are unchanged. Three
scene-only views matched camera, elapsed time, viewport, DPR and backend.
The preserved scene assigns random phases to two bank lights; the initial
unseeded RGB mean deltas were 0.1713 / 0.0136 / 0.4317 on a 0–255 scale.
The final test-only fixed seed removes that variability: entrance is pixel
identical; feature differs at two pixels and bank at one pixel, each by a maximum
channel delta of 1 out of 255. No pixels differ by more than 1. Production code
was not seeded or changed by these test hooks. This is narrow visual evidence,
not a guarantee across all viewpoints, drivers or devices.

## Remaining limits

One first Sword Guys iframe launch showed a blank canvas during about 22 seconds
of input. Full-page, reopen, fresh baseline and fresh candidate launches rendered
correctly, followed by successful sustained candidate play. No page error or
blocked game origin explained it. This isolated startup anomaly was not
root-caused and is not claimed fixed.

Native OSRS remains cramped at 390px width or 800×390 short landscape. Host Back
and full-page controls remain accessible. Game-internal responsive layout belongs
to that game's owner. Physical-device mouse feel, screen-reader announcements,
visibility on real OS tab switches and sustained FPS/frame timing were not
assessed. Draw/RAF counters establish lifecycle, not GPU smoothness or AAA
performance. Raw receipts retain recovered QA protocol/selector errors. The only
request failures were canceled game documents and injected engine-import failure;
there were no page errors or blocked non-game origins.

## Preservation and cleanup

Claude12 is frozen from Lab commit 17170c4f6210f2a93245e6a6cb94adcb1c6c0335.
All ten original frozen files were rehash-verified against preserved provenance.
Archive SHA256: dc3a7903de3fcd7f10286997fe1594be2c1a16b5cdc9fbbbe6938b99da4c6d8c.
Original HTML SHA256: 06418de0ac9942173479aa2303ef7896ea368c2ad36a3dd3e68714847e255005.
Original Three SHA256: 0a3368c165eea773490aec7b77c22de70e3eac288503409256fdbf4d12578416.

Geometry/input, catalog/order, routes, game progress, default camera, canonical
room handoff, engine and saved versions remain unchanged from the live merge.
No other repositories, game internals, entrants, settings, permissions or
credentials changed. No benchmarks ran and no experimental deployment occurred.

Each owned page/context/browser and mobile fixture server closed through the
repository lifecycle helper. Recorded Chrome identities, helper processes and
owned listeners were checked after exit. Main WebSocket port 49254 and mobile
ports 52445/52446 closed. The final visual pass has its own equivalent receipt.
No preview server or watcher remains; the graphics slot is released.
