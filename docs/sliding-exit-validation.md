# Sliding Arcade exits

Both existing Home anchors remain available through E/tap and the website Home link. The glass entrance has two sliding panels; the rear EXIT has one panel sliding toward the room centre. Both reuse existing materials and textures, with no new lights, timers or frame loops.

`arcade-exits.js` owns the two placement records and persistent panel colliders. The existing controller advances doors before swept player movement. The same eased displacement positions geometry and colliders. Approaching opens a door; navigation occurs only when an armed player walks outward across a plane 18 cm beyond the doorway, with enough actual panel clearance for the player's 27 cm radius. Reduced motion snaps the opening. Standing, retreating, passing alongside, or starting outside cannot trigger departure.

The rear wall now has an actual doorway rather than a solid panel against an unbroken wall. Small landing boundaries contain the player if navigation is blocked. The entrance's centre stile moves with its panels. Manual Home actions use the same guarded departure callback as walking. That callback pauses before the app disposes the world and renderer and assigns `/` in the same tab.

Pause, inspection, reset, hidden page and lost focus cancel pending crossing intent. A resumed player at the threshold can continue outward without walking back. Successful departure is one-shot. Scene disposal stops the door state along with existing resource cleanup.

CPU validation: the full `npm test` suite passes, including both actual scene openings, closed-panel collision, outward crossings, interruption, reduced motion, duplicate departure and disposal. Independent review found no material defects; 24 additional swept approaches covered both doors, three lateral offsets, walking/running and normal/reduced motion. Static construction counts: 184 visible meshes, 63,333 triangles, 79 textures, 149 static material buckets and 31 collision rectangles. These are structural counts, not GPU performance measurements.

Rendered doorway appearance, walking feel, homepage round trip and combined Library exit QA remain pending parent coordination. No browser, GPU, preview server, deploy, benchmark run or settings change was used for this work. The original provenance, canonical inline handoff and archived version bytes remain unchanged.
