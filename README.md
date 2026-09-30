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

## Navigation checks

Ghost Signal and Night Courier are coming-soon cabinets. They can be inspected in 3D, but do not launch a game. The HTML directory is also available when WebGL or the Three.js engine cannot initialize.

Run the existing link contract and the browser regression checks:

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The browser checks cover unavailable WebGL, renderer startup failure, engine download failure, the mobile directory, repeated desktop/mobile transitions, cabinet availability, and launch/back navigation. They serve a test-only instrumented copy of the page and stub game destinations; they do not contact or launch the real games.

To use an installed Chrome instead of downloading Chromium, set `$env:BROWSER_CHANNEL='chrome'`. The checks use the page's pinned Three.js CDN build; for offline checks, set `$env:THREE_MODULE_PATH` to a local copy of `three@0.157.0/build/three.module.js`.
