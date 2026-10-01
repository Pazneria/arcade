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

Phones and tablets with WebGL now enter the 3D arcade. Hold Forward or Backward to move down the aisle, drag the scene to look around, and tap a cabinet to inspect it. Previous and Next also browse cabinets directly. Use the large Launch, Guide, and Back to aisle buttons while inspecting.

Games opens the HTML directory without resetting your position; Return to 3D arcade resumes it. Home / Exit returns to the main site. Coming-soon cabinets remain inspectable without launch links.

Touch rendering is capped at 30 fps with a 900,000-pixel budget, fewer background stars, and a capped pixel ratio. Rendering pauses while the directory is open or the page is hidden. Interrupted touches stop movement. Engine failure or a lost WebGL context falls back to the HTML directory; reload to retry 3D.

## Cabinet guides

A game gets a Guide action only if its entry in the `games` registry in `index.html` sets an optional `guideUrl`. That one field controls every Guide surface:

- **3D cabinet:** the action panel shows PLAY | GUIDE | BACK (brass book button). Without a guide it shows PLAY | BACK.
- **Guide lectern:** a book pedestal stands in front of the cabinet. Clicking or tapping the book focuses it; activating it again opens the guide.
- **Desktop strip:** a compact Play / Guide / Back strip appears at the bottom while a cabinet is inspected. It also has Previous/Next cabinet buttons and appears when keyboard focus Tabs into it.
- **Touch strip:** the existing Launch / Guide / Back to aisle buttons.
- **HTML directory:** a Guide link next to Launch.

Guide controls in the DOM are ordinary links named "Open <game> guide". A Guide link only gets its `href` after the camera has finished moving to the cabinet and the intro has ended. In the 3D arcade the guide opens in the same tab and remembers the selected cabinet, so returning puts you back at it. Directory links open in a new tab and say so in their accessible name. Escape returns to the aisle, including from a focused cabinet action; it leaves editable controls and the flat directory alone.

RaceGPT uses `https://pazneria.github.io/racegpt/wiki/` and Sword Guys uses `https://pazneria.github.io/sword-guys/wiki/`. OSRS Clone currently uses `https://pazneria.github.io/osrs-clone-codex/`, built with `buildCodexHomeUrl` from `codex-link-contract.js` to keep its `from=arcade` / `returnTo` query contract. Hub publication is held until the refreshed OSRS `/osrs-clone-codex/wiki/` route is confirmed and configured. Add a URL only after its wiki is published and confirmed. Coming-soon cabinets never show Guide.

Guide destinations must be absolute HTTPS URLs without embedded credentials. Invalid entries show no Guide action. Directory titles and descriptions use text nodes, and links use native DOM attributes; wiki content is never fetched or embedded by the hub. New-tab directory links retain `noopener`.

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

Guide checks exercise native keyboard/touch navigation, the cabinet button and book lectern, selected-cabinet restoration, landscape touch targets, fallback links, and rejection of unsafe URL schemes or credentialed destinations. Hostile directory names remain literal text. These focused checks are not a complete security audit of the hub or linked wikis.

To use an installed Chrome instead of downloading Chromium, set `$env:BROWSER_CHANNEL='chrome'`. The checks use the page's pinned Three.js CDN build; for offline checks, set `$env:THREE_MODULE_PATH` to a local copy of `three@0.157.0/build/three.module.js`.
