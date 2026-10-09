# RaceGPT cabinet title and menu

This is an isolated craft exercise based on RaceGPT commit `91cccb406ecdb9a6a733237e62f1040ffcf339cd`. It adds a physical-screen Canvas2D composition and an input/launch state machine. It changes no car physics, replay, PB, save keys, track definitions, original assets, published site, or cabinet camera. No benchmark score is claimed.

## Integration files

Copy `src/cabinet/racegpt-menu.js` and its relative import `src/cabinet/track-art.js` together. The module has no dependencies, browser globals, event listeners, RAF, timers, storage, audio, network, navigation, or game construction. The host owns all these effects. It can import the same module into a Three.js cabinet host or use an ordinary 2D canvas. No DOM overlay is part of the cabinet composition.

```js
import {createMenu, draw, createRaceGptLaunchUrl} from './racegpt-menu.js';
const menu = createMenu({
  onChange: state => { dirty = true; syncAccessibleButtons(state); },
  onBack: () => leaveCabinet(),
  onStart: (selection, request) => {
    // Exactly one launch per request. Preserve request.id until completion.
    const url = createRaceGptLaunchUrl(nativeGameUrl, selection);
    launchNativeGame(url, request.signal).then(
      () => menu.ready(request.id),
      error => menu.error(request.id, error)
    );
  }
});
// Host RAF: repaint at 10–15 Hz when this screen is visible, then mark texture dirty.
draw(ctx, {width: canvas.width, height: canvas.height, time: nowMs,
  state: menu.getState(), reducedMotion: prefersReducedMotion});
menu.pointer({u, v, type: 'up'}); // top-left coordinates after the host's ray/UV conversion
menu.key({code: event.code, repeat: event.repeat, shiftKey: event.shiftKey});
// Cabinet exit, interrupted launch, hidden scene: reset and release host input.
menu.reset();
// Final teardown only:
menu.dispose();
```

The `launchNativeGame` and host functions above are integration placeholders, not shipped effects. A resolved `onStart` promise does not automatically mark ready: the host must confirm its actual native-game readiness. Rejected promises and thrown errors enter the readable retry state. Use an actual ready/error signal or a successful new-document load according to the host's launch policy. Never call `ready` merely because a timeout elapsed.

## Interface

| Export / method | Contract |
| --- | --- |
| `draw(ctx,{width,height,time,state,reducedMotion})` | Pure Canvas2D paint, logical 1280×960 composition. Time in milliseconds. Restores caller context. No animation loop. |
| `createMenu({onStart,onBack,onChange,trackId,settings})` | Returns controller. Initial focus is Start; default canonical course is Track A. Optional settings are copied and frozen; no save is changed. |
| `getState()` | Frozen snapshot: phase, trackId, index, focus, hover, message, requestId, settings. Phases: menu/loading/playing/error/disposed. |
| `onStart(selection,request)` | Frozen `{trackId,settings}` and `{id,signal}`. Loading is set before callback. Further starts are ignored while loading or playing. |
| `ready(id)` / `error(id,cause)` | Settle only the current loading request. Returns false for stale/cancelled/duplicate/disposed completions. Error screen shows a stable message, never raw exception text. Host can log cause separately. |
| `cancel()` / `reset()` | Abort current request, restore menu, retain selected course, clear hover/error and restore Start focus. Re-entry does not allocate a game or loop. |
| `dispose()` | Terminal abort. Reset/start/input ignored thereafter. |
| `activate(id)` / `selectTrack(trackId)` | Accessible/native action seam. IDs are canonical track IDs, `start`, `back`, and `cancel`. |
| `pointer({u,v,type})` | Normalized top-left [0,1]. `move`, `leave`, `down`, and **one** of `up`/`click`/`activate`. Down focuses only. Do not forward both up and click. |
| `key({code,repeat,shiftKey})` | Returns consumed boolean. Left/right or A/D choose track and focus Start. Enter/Space activates focus. Up/down switches Start/Back. Tab/Shift+Tab visits track buttons, Start, Back. Escape backs out or cancels loading. Repeats ignored. Loading Enter is inert until Tab focuses Cancel. |
| `MENU_HOTSPOTS`, `CANCEL_HOTSPOT`, `getHotspots()` | Frozen normalized bounds and action labels. `getHotspots` reflects current phase. Start and Cancel do not overlap, protecting rapid double activation. |
| `createRaceGptLaunchUrl(base,selection)` | Validated HTTP(S), no credentials, canonical `?track=`. Preserves from/returnTo and clears autoplay/driver/showcase flags. Opens the selected native menu by default. |

The host must abort the actual work when `request.signal` aborts. If a navigation is irreversible, the host should remove Cancel after committing navigation. The controller cannot undo a host navigation or clean up game instances created by a noncompliant launcher. Its design avoids creating any itself.

Native accessible buttons must call `activate(id)`, mirror `aria-pressed` for course selection, disable course/Start/Back during loading, provide a Cancel button, and return focus on cabinet re-entry. The visual Canvas2D buttons and native controls use the same action IDs. The host should scope keyboard forwarding to its selected cabinet and release driving/aisle held input on every transition.

## Art and content

The design uses a large italic racing wordmark, finish checker, silver wedge car with dark glass/rear wing, and amber track selection. The car illustration is derived from the native procedural car's body proportions and colors in `src/render/SceneRenderer.ts`; it is drawn entirely with Canvas2D. Course diagrams are normalized samples of the actual canonical track centerlines, with real checkpoint markers and a moving ghost dot. Their generated presentation snapshot is regenerated with:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/export-cabinet-tracks.ts
```

Track A `banked-shakedown`: 30–60 second target, one checkpoint. Track B `test-track-b`: long faster route, one checkpoint. Track C `technical-bowl`: technical banked bowl, two checkpoints. Track D `jump-speedcheck`: ramp/landing, two checkpoints. No times or invented PB records appear. Settings default to an empty object: the native game's existing settings and saves remain authoritative. The URL contract only forwards the supported track selection.

Idle motion is one small ghost along the real route over 18 seconds. Loading has a slow accent sweep. Reduced motion fixes the dot/sweep. There is no zoom, full-screen flashing, autoplay physics, audio, or token animation. Safe gutters are 64px left/right; main actions are 108px tall. The native cabinet screen (~1.4 aspect) can use 1280×960 or an equivalent resolution. Physical perspective legibility must be reviewed in the host at its standing eye/FOV; a flat screenshot alone does not prove that acceptance criterion.

## Optional native start bridge

`patches/cabinet-start.patch` is separate and optional. It adds `src/cabinet/native-boot.ts`, replaces `src/start.ts` boot with a page-local singleton factory, and adds a guarded public `startFromCabinet` entry to `RaceGptApp`. Apply only to an isolated native-game checkout:

```powershell
git apply --check patches/cabinet-start.patch
git apply patches/cabinet-start.patch
```

Only the patched game understands `?track=<canonical-id>&arcadeStart=1`. It boots one native application, then begins the existing countdown once. Without that flag it retains the existing native menu. No physics is changed. It emits window `racegpt:ready` with `{autoStarted,trackId}` after construction/start, or `racegpt:error` after a failed construction. These are local document events, not cross-origin postMessage channels; an iframe integrator must explicitly bridge them through its own verified message/origin contract. Failure is latched until page reload to avoid reconstructing a partial application.

The unpatched live game does **not** honor arcadeStart. The cabinet helper intentionally does not add it. Keep the truthful native-menu launch until the patch is independently integrated and served. The patch is not applied in this deliverable's default source tree.

## Review and verification

`cabinet-preview.html` is a local review harness with a clearly labelled launch stub; it never launches a game. Its two-second ready timer exists only in the harness. The production module contains no such timer. The host integrates the artwork, real launch policy, and accessible controls separately.

CPU checks:

```powershell
node scripts/cabinet-menu-tests.mjs
node node_modules/tsx/dist/cli.mjs scripts/cabinet-boot-tests.ts
npm.cmd run typecheck
npm.cmd test
npm.cmd run smoke:sim
npm.cmd run build
```

Menu checks cover wraparound course navigation, Tab order, normalized pointer targets, repeated Start, cancellation/re-entry, old ready/error callbacks, failure/retry, terminal disposal, immutable selection, URL preservation/validation, and source-only paint smoke across all courses and phases. Boot checks cover a single app and opt-in countdown, unchanged ordinary menu boot, immutable readiness detail, and failed-boot latching. Existing game checks cover input cancellation, physics, seven driver variants, PB replay, restart/countdown/timing gates, frame-cadence independence and player-record isolation. Source paint smoke does not verify font metrics or physical perspective.

After a coordinated graphics slot is granted, the prepared bounded review command is:

```powershell
$env:PLAYWRIGHT_MODULE = '<existing-playwright-module-path>'
# Optional existing executable; no browser installation required.
$env:BROWSER_EXECUTABLE = '<existing-chrome-executable-path>'
node scripts/review-cabinet-menu.mjs
```

It serves only the isolated review HTML/JS on loopback port 5547, runs one headless Chromium with GPU/WebGL disabled, captures four tracks plus loading/error and 512px display size, exercises keyboard/pointer input, times 100 Canvas2D paints, and closes its own browser/server. It does not open/focus a window or access live game/save data. The physical cabinet view belongs to the integration worker's coordinated review.
