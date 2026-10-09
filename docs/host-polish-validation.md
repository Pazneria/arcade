# Experimental Arcade host candidate

This local candidate starts from published PR48 merge
`5feed14ca411bf4050f4df0cc7ba88c7bb7a9c75` on
`experiment/arcade-host-polish`. It has not been published or graphics-tested.
The coordinator must clear a sequential browser window before the
[bounded playtest](host-polish-playtest.md) runs.

## Concrete changes

- Next/Previous retain keyboard focus across repeated selection. Initial
  cabinet inspection still focuses the primary action; selected titles use a
  polite live region.
- Game opening has visible status and a 10-second soft delay with retry. Back
  and full-page launch stay available. The opening iframe is inert; cancellation
  removes its listeners, timer and document. Late callbacks cannot revive it.
  A current loaded frame gets focus only if the page is visible/focused and the
  user has stayed on the opening host control. Document load does not establish
  game-engine readiness.
- The Games directory follows the actual fixed navigation bottom and resets
  its scroll/focus on opening. View cabinet enters the existing inspection flow;
  native new-tab Launch/Guide links and renderer-failure fallback remain.

## Evidence so far

The new keyboard regression check fails on the exact live app source with
`Repeated keyboard activation keeps browsing instead of landing on Play`, then
passes with the candidate. Deterministic CPU checks cover opening/delay/error,
retry single ownership, old timeout/load cancellation, focus retention, early
Escape, directory selection, navigation measurement and observer cleanup.

The complete 12-command `package.json` test suite passes, including browser
fixture **syntax parsing only**. These checks use CPU fakes/drawing recorders;
no browser, server, WebGL renderer, native UI or benchmark ran for this candidate.
No owned runtime resources remain.

Independent review first found the live carousel focus error and directory
overlap, then caught the new opening frame's premature focus. That opening
focus finding was fixed and reviewed again. The final review reports no
remaining material findings in the six-file host diff. Rendered layout and
assistive-technology announcements remain validation items.

## Preservation

Scene geometry, controller/input behavior, art, catalog/order, routing, progress
storage, default camera, canonical room-handoff bootstrap, vendored engine,
and saved versions are unchanged from the live merge. The source provenance
file is unchanged. Claude12 remains frozen from Lab commit
`17170c4f6210f2a93245e6a6cb94adcb1c6c0335`:

- Source archive SHA256:
  `dc3a7903de3fcd7f10286997fe1594be2c1a16b5cdc9fbbbe6938b99da4c6d8c`.
- Original HTML SHA256:
  `06418de0ac9942173479aa2303ef7896ea368c2ad36a3dd3e68714847e255005`.
- Original Three module SHA256:
  `0a3368c165eea773490aec7b77c22de70e3eac288503409256fdbf4d12578416`.

No game internals, other workers' projects, homepage assets, Library preview,
benchmark entrants, credentials, permissions or settings were touched.

## Open acceptance items

Real keyboard activation and iframe inert behavior, game-size usability,
portrait/short-landscape layout, native sustained play/return, actual discovery
and walking exits, browser Back, touch/resize, visibility and console/network
evidence require the cleared playtest. No FPS, physical mouse feel or GPU
smoothness claim is made from the CPU results. The small native-game viewport
remains a playtest hypothesis rather than a speculative change.
