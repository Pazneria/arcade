# Arcade

This repository hosts the landing page for the Pazneria arcade. The site is available at https://pazneria.github.io/arcade and will link to individual games.

Each game should be developed in its own repository under the Pazneria account. When your game is ready, add a link to it on the `index.html` page in this repository so it appears on the arcade page.

## Run locally

From this folder, run:

```powershell
npm.cmd run dev
```

This opens your browser to `http://localhost:5510`, starts the local dev server, and auto-reloads the page whenever tracked project files change.
If `5510` is already in use, the server automatically falls forward to the next available port and opens that URL instead.

The Sword Guys cabinet launches the sibling local dev server while the arcade is running locally. Start Sword Guys separately from `..\sword-guys`:

```powershell
npm.cmd run dev -- --port 5179
```

Optional (server only, no auto-open):

```powershell
npm.cmd run serve
```

Legacy option:

```powershell
.\run.bat
```

More games coming soon!

## Mobile 3D controls

Phones and tablets with WebGL now enter the 3D arcade. Hold Forward or Backward to move down the aisle, drag the scene to look around, and tap a cabinet to inspect it. Previous and Next also browse cabinets directly. Use the large Launch, Codex, and Back to aisle buttons while inspecting.

Games opens the HTML directory without resetting your position; Return to 3D arcade resumes it. Home / Exit returns to the main site. Coming-soon cabinets remain inspectable without launch links.

Touch rendering is capped at 30 fps with a 900,000-pixel budget, fewer background stars, and a capped pixel ratio. Rendering pauses while the directory is open or the page is hidden. Interrupted touches stop movement. Engine failure or a lost WebGL context falls back to the HTML directory; reload to retry 3D.

## Navigation checks

The 3D hall uses warm plaster, walnut wall panels, oak flooring, and brass lighting. Each game has its own printed marquee and cabinet artwork; the framed EXIT sign stays readable without sparks or strong bloom. The room and artwork are procedural, with no additional dependencies or downloads. Repeated room parts share geometry, touch devices use fewer real lights, and the enclosed hall skips the old star field.

Ghost Signal and Night Courier are coming-soon cabinets. They can be inspected in 3D, but do not launch a game. The HTML directory is also available when WebGL or the Three.js engine cannot initialize.

Run the existing link contract and the browser regression checks:

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The browser checks cover unavailable WebGL on desktop and mobile, renderer startup failure, engine download failure, lost contexts, held and cancelled touch movement, drag look, cabinet browsing, portrait/landscape resizing, directory pause/resume, and repeated launch/back navigation. They also check that the EXIT sign fits its inspection view, its design arrows cycle correctly, and clicking the actual 3D door navigates Home. They serve a test-only instrumented copy of the page and stub game destinations; they do not contact or launch the real games.

To use an installed Chrome instead of downloading Chromium, set `$env:BROWSER_CHANNEL='chrome'`. The checks use the page's pinned Three.js CDN build; for offline checks, set `$env:THREE_MODULE_PATH` to a local copy of `three@0.157.0/build/three.module.js`.
