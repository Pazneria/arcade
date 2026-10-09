# Virtual play token

Standalone craft module for the preserved Pazneria arcade at `e88a27f4d27d695d1f0e1b61faa3d0d207d5b9b5`. It changes no existing host, game menu, camera, catalog, saves, version snapshot, or published site. This is a fictional token interaction; the prop contains no currency or payment flow.

Copy the complete `assets/token-entry/` directory. It has three browser ESM files, no package dependencies and no network requests. Three.js is injected (CPU validation uses the preserved local r169 engine). Geometry and three small CanvasTextures are authored at construction. No image loader, private RAF, timer, light, audio, bloom or particle system is created.

```js
import {createTokenEntry} from './token-entry/token-entry.js';

const entry = createTokenEntry({
  THREE,
  parent: anchor.tokenMount.parent ?? anchor.cabinetRoot,
  mount: anchor.tokenMount,
  reducedMotion: () => reducedMotionMedia.matches,
  onStart: ({id, signal}) => showStartingLabel(),
  onInsert: ({id, ready}) => { if (!ready) showPreparingLabel(); },
  onState: ({phase, ready, inserted, active, id}) => updateTokenState(phase),
  onComplete: ({id, value}) => acknowledgeToken(),
  onCancel: ({id, reason}) => clearTokenLabel(),
  onError: ({id, error}) => showRetryAndBack(error),
  onHookError: (error, hookName) => reportHostHookError(error, hookName),
});

// Call from the existing host animation loop, in seconds.
entry.update(dtSeconds);

// Host first creates its actual game document, inert and hidden behind the cover.
// A module does not interpret an iframe load as engine readiness: the integrator
// chooses/document its readiness source. There is no invented progress value.
const operation = new AbortController();
const selectedSession = currentSession;
entry.start({
  signal: operation.signal,
  preload: ({signal, id}) => actualGameReadyPromise,
}).then(value => {
  if (operation.signal.aborted || currentSession !== selectedSession) return;
  revealAndUnlockCurrentGame(value);
}).catch(error => {
  if (error.name !== 'AbortError') showRetryAndBack(error);
});

// Escape/Back/blur/selection changes: host removes its frame as well.
operation.abort('Back'); // or entry.cancel('Back')
entry.reset();           // idle, permits a fresh attempt
entry.dispose();         // cancels current attempt and frees only owned resources
```

`start({signal,preload})` returns exactly the same Promise on a repeated call while an attempt is active. The preload callback runs once, immediately, with an owned AbortSignal; it must return a thenable. Passing a readiness Promise directly also works. The owned signal aborts on cancellation/error/disposal. External listener removal, stale-success and stale-error isolation are covered by focused tests. A successful return value is the preload's value. Cancellation rejects with `AbortError`; errors reject with their original value. A disposed instance rejects future starts.

`onStart`, `onInsert`, `onComplete`, `onCancel`, `onError` and `onState` are optional, direct top-level hooks. Completion occurs once, only when both insertion and preload have finished. Host hook exceptions are contained and reported through optional `onHookError`. Hook-triggered cancellation is supported. Reentrant host callbacks should still use their session id before changing host UI.

The module's phases are `idle`, `inserting`, `waiting`, `complete`, `cancelled`, `error`, `disposed`. `ready` and `inserted` are actual Boolean events, not percentages. Waiting is static: token has disappeared into the slot, escutcheon remains visible, and `update` returns immediately. No idle loop or poll is scheduled. Idle/complete/cancelled/error roots are hidden and idle `update` does no matrix/pose work.

## Attachment and dimensions

Mount is `{position:[x,y,z], rotation:[rx,ry,rz], scale:1}` relative to `parent`; Euler angles are XYZ radians. Scale can alternatively be a positive three-component array. Root local +Z faces the player, +Y is up, +X is right. Token travels toward -Z. Module never accesses a camera. The mount must match the slot orientation; a tilted coin-door Group is a suitable parent because its authored transform is preserved.

The cabinet integrator supplied a geometry-derived coin-door attachment:

```js
anchor.tokenMount = {
  parent: survivingCoinDoorGroup,
  position: [-0.065, 0.085, 0.033],
  rotation: [0, 0, 0],
};
```

This targets the left existing insert panel; depth comes from that Group, rather than a hardcoded cabinet bank depth. The `parent` member is ignored by the mount parser; pass it as `parent` separately. Equivalent cabinet-local attachments work when the cabinet root is the parent. Default mount is origin with identity rotation/scale.

Default token diameter is 0.104 m and thickness 0.0072 m. It is intentionally a readable virtual arcade token, slightly larger than a physical coin. Bevelled brass core, two raised rims, two inset rings, embossed stars, 88 instanced edge reeds, recessed curved letters and fine radial machining marks define it. Slot plate is 0.094 × 0.196 m with a true 0.013 × 0.12 m aperture, two slotted screws and a small steady amber pin. The supplied assembly covers one existing lit insert decal. Verify it fits the final host standing view; do not zoom the player to show it.

`radius`, `thickness`, `document` and borrowed `envMap` are optional construction inputs. `document:null` skips the face textures for CPU environments. Supplied env maps are never disposed. Clipping is implemented on owned token materials and follows parent transforms; no renderer clipping flag, global shader, or host material is modified. The token is clipped at slot-local Z = 0.008 m so a decorative solid cabinet can receive it without changing its mesh.

## Motion and review

Default duration is 0.92 s: a small settled presentation, approach and quarter-turn alignment, then a firm short insertion. Alignment finishes at 63% of that authored motion; X/Y and orientation remain fixed for the final push. This fraction is animation timing, never exposed as loading progress. No bounce, spin loop, sparks or artificial camera movement. Host may configure `duration` if needed; one second or less is recommended.

Reduced motion is a stationary face-on token acknowledgment for 0.10 s, then hidden. It uses the identical ready/inserted barrier and cancel/retry semantics. There is no motion equivalent involving a fade loop or travelling object. Duration can be configured with `reducedDuration`, including zero; still call `update(0)` to deliver its insertion event.

CPU checks: `node scripts/token-entry/test-token-entry.cjs`. Existing link check: `node scripts/test-codex-link-contract.js`. Graphics review requires the parent's coordinated slot. A standalone, manual-timestep fixture/capture script is provided under `scripts/token-entry/`; it never opens/focuses a visible browser, uses only local files and an ephemeral private server, closes its browser/server, and does not touch localhost 5418.
