# Arcade host polish: bounded playtest

Experimental branch: `experiment/arcade-host-polish`.
Baseline: live PR48 merge `5feed14ca411bf4050f4df0cc7ba88c7bb7a9c75`.
The branch is local and is not approved for publication.

## Current hold and scope

CPU/source inspection and tests are permitted. Do not start a browser, local
server, native UI, renderer, or performance session until the coordinator gives
explicit graphics clearance. Lab currently owns that window. Keep Library's
review server at localhost:5418, other workers, benchmark entrants, and the
Rebound Relay gameplay owner's session untouched.

The pass belongs to the Arcade host: entering, discovering games, selecting,
reading, opening, returning, navigating Home, repeating, cancelling, and
resizing. It does not change game internals or run benchmarks. Use disposable
profiles and block outbound writes, votes, score submission, and unapproved
destinations. Preserve all native game routes, game-owned progress, frozen
Claude12 inputs, geometry, default entry pose, and canonical room handoff.

## Findings already grounded in source/CPU evidence

| Trigger on live source | Candidate behavior | Remaining validation |
| --- | --- | --- |
| Focus Next/Previous and activate twice: the first activation moves focus to Play/Back. | Carousel activation retains its button focus; the selected title is a polite live region. | Real keyboard activation, focus ring visibility, announcements. |
| Start a game whose document is delayed: the cabinet becomes a blank iframe with no opening or recovery state. | Opening status, a soft delay after 10 seconds, and retry accompany existing Back/full-page controls. | Real delayed document, visible text, early Escape/Back and retry. |
| Immediate child focus during slow opening precedes installation of child Escape listeners. | Opening frame is inert; visible Back holds focus. A current loaded frame receives focus only if the user has stayed there. | Browser iframe inert behavior and late-load focus/cancellation. |
| Fixed navigation wraps below the directory's fixed 95px top padding in portrait layouts. | Directory follows the measured navigation bottom, resets scroll on opening, and places focus without scroll. | Actual wrapped navigation, heading clearance, keyboard scrolling and resize. |
| Directory offers only native new-tab game launch. | View cabinet enters the same host inspection flow; native Launch/Guide links remain. | All six selections and renderer-failure fallback. |

The earlier narrow cabinet game viewport is a hypothesis to inspect during play,
not evidence for an arbitrary layout change. Document actual clipping and usable
controls before choosing an additional fix.

## Session discipline and evidence

Use exactly one background Chrome browser at a time, with fresh sequential
contexts and identical baseline/candidate viewport, DPR, motion preference, and
renderer backend. Fully close the previous context before the next. Use the
existing owned QA lifecycle helpers and ephemeral fixture server; no open-ended
preview server or dev-server watcher. Never attach to existing tabs or profiles.

Record the candidate commit, browser/version/backend, viewport/DPR, elapsed
interaction time, input sequence, observed outcome, screenshots, console/network
errors, renderer/frame lifecycle, and context/server/process cleanup. Assess
screenshots after each flow. Script assertions support the observations; a
250ms input smoke test does not stand in for sustained play.

Budget 20–25 minutes of active interaction, with a 30-minute hard stop. Allow a
separate bounded fix/retest slot only when clearance covers it and the 12:50 UTC
experiment deadline allows it. Abort promptly if another owner needs graphics.
This is functional host QA, not an FPS benchmark or a claim about physical
mouse feel or GPU smoothness.

## Sequential pass after clearance

1. **Matched baseline reproduction (3 minutes).** On the exact live merge, use
   actual keyboard activation to reproduce repeated Next/Previous focus; a
   gated game-document GET to observe blank opening/cancellation; and portrait
   directory capture to record navigation clearance. Close this context.
2. **First arrival and discovery (4 minutes).** Enter at the default pose with
   empty host session storage. Walk and look with normal inputs, inspect an
   actual nearby cabinet, read its menu, use Back/Escape, then discover another.
   Do not teleport or call `faceAnchor` for this holistic path. Through the
   directory, inspect all six cabinets; repeat Next/Previous around the loop
   twice using only the keyboard. Check coming-soon menus and their return.
3. **Sustained native play and return (5 minutes).** Use RaceGPT, Sword Guys,
   and OSRS Clone for 60–90 seconds each after native Start/entry. Exercise more
   than one meaningful input and inspect game controls at their actual host
   size. Use a disposable OSRS character. Check that the Arcade RAF/draw count
   stays paused throughout. Return by child Escape for one game and persistent
   Back for another; reopen each, then verify detached game callbacks stop and
   game-owned progress remains. Rebound Relay gets host menu/route/wrapper checks
   only; its gameplay is the separate owner's task.
4. **Slow opening and recovery (3 minutes).** Hold a game document GET beyond
   10 seconds. Verify visible opening/delay status, host Back focus, early
   Escape and click Back. Retry once, release the obsolete request, and verify
   one current frame. Move focus to full-page before release: late load must
   not steal it. Release a current request and verify the cover clears. Include
   abort/error behavior without claiming iframe load proves engine readiness.
5. **Portrait, short landscape, resize (4 minutes).** Fresh 390×844 coarse-touch
   context, then 800×390; test all six readable menus, scroll/Back and directory
   heading/nav separation. Drag-look and movement controls must stop on release
   or cancel. Resize while opening and while playing; retain one game frame,
   usable persistent Back/full-page controls, and a paused Arcade renderer.
6. **Host exits and repeat (4 minutes).** Walk to both physical Home exits with
   ordinary movement and look, approach/retreat/cross. Test website Home,
   full-page game launch, and real browser Back. Check one restored renderer,
   matching cabinet selection where appropriate, immediate usable controls,
   blur/visibility pause, repeat opening/return, and cancellation while the
   scene engine request is held. Stub unrelated Home/Lab/Library destinations.

Readiness or a screenshot may use passive test instrumentation. Controller
teleports, direct `inspect()` calls, and stub-game tests must be identified as
targeted checks and cannot substitute for the arrival/discovery or sustained
native-play flows.

## Decision and cleanup

For each friction, record trigger, severity, before/after evidence, and the
smallest host change that resolves it. Fix concrete issues, rerun the affected
flow, and run the CPU suite once for the final source. Avoid visual churn.
An independent reviewer may find no additional material issues.

Close every owned page/context/browser and server in `finally`, release held
requests and input, and verify recorded process identities and ephemeral ports
are gone. Retain screenshots and receipts. Report unsatisfied acceptance items
explicitly; graphics clearance or an untested hypothesis is not a passing test.
