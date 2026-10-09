# Cabinet craft integration contract

Base: `e88a27f4d27d695d1f0e1b61faa3d0d207d5b9b5`, preserving the unshipped host polish on the live PR48 merge. This exercise changes the production derivative only. Frozen entries, saved versions, native game storage and the live site remain untouched.

The cabinet menu stays on the physical tilted screen. Selecting a nearby cabinet preserves the player's standing position and lens; directory selection uses the existing safe approach point at normal standing height. The host owns the projected screen quad, ray-to-UV mapping, focus, RAF and aisle return. The menu worker owns Canvas2D drawing and menu state. The token worker owns only its prop and abortable insertion/preload barrier.

The title/menu contract uses `draw(ctx,{width,height,time,state})`, `createMenu({onStart,onBack,onChange})`, normalized top-left `pointer({u,v,type})`, `key({code,repeat})`, `getState()`, `reset()` and `dispose()`. Start supplies immutable selection and attempt ID/signal; completion/error must match the current attempt. RaceGPT's existing native `?track=` route selects the real track; no unsupported game readiness claims or implicit game-code changes.

The token contract uses Three injection, cabinet-local parent/mount, deterministic `update(dtSeconds)`, `start({signal,preload})`, `cancel/reset/dispose`, no private RAF or loader. One attempt may complete only after both token insertion and the current inert game document load. Escape, Back, visibility interruption, failure and replacement invalidate late callbacks.

Gameplay receives a separate, reversible playable viewport after insertion. The camera does not move or change lens. Fit to cabinet and the existing full-page route remain available; one iframe retains its storage and game state across resizing. Returning removes the child document, restores the saved aisle pose/focus and resumes deliberate mouse look.

CPU/source checks precede graphics. Rendered evidence requires a coordinated bounded slot, one disposable background browser, owned temporary server and complete cleanup. Nothing is published or merged.
