import { TRACKS } from './track-art.js';
export { TRACKS };

// The actual standing projection is ~140x174, not the flat 4:3 preview.
// A portrait logical composition restores glyph proportions after projection.
export const DESIGN = Object.freeze({width: 960, height: 1280});
const rect = (id, x, y, w, h, label) => Object.freeze({
  id, label, u: x / DESIGN.width, v: y / DESIGN.height,
  width: w / DESIGN.width, height: h / DESIGN.height
});
export const MENU_HOTSPOTS = Object.freeze([
  ...TRACKS.map((track, i) => rect(track.id, 48 + i * 222, 588, 198, 120, track.name)),
  rect('start', 48, 740, 864, 184, 'Start run'),
  rect('back', 48, 1176, 864, 80, 'Back to arcade')
]);
export const CANCEL_HOTSPOT = rect('cancel', 48, 1176, 864, 80, 'Cancel loading');

/** No listeners, timers, storage, DOM, RAF, navigation, audio or game instances. */
export function createMenu({onStart = () => {}, onBack = () => {}, onChange = () => {},
  trackId = TRACKS[0].id, settings = {}} = {}) {
  let index = Math.max(0, TRACKS.findIndex(track => track.id === trackId));
  let phase = 'menu';
  let focus = 'start';
  let hover = null;
  let message = '';
  let serial = 0;
  let attempt = null;
  let abort = null;
  const frozenSettings = Object.freeze({...settings});
  const getState = () => Object.freeze({phase, trackId: TRACKS[index].id, index,
    focus, hover, message, requestId: attempt?.id ?? null, settings: frozenSettings});
  const notify = () => onChange(getState());
  function invalidate() {
    // Invalidate first: abort handlers cannot settle the old generation.
    attempt = null;
    const previous = abort;
    abort = null;
    previous?.abort();
  }
  function reset() {
    if (phase === 'disposed') return false;
    invalidate();
    phase = 'menu'; focus = 'start'; hover = null; message = '';
    notify(); return true;
  }
  function selectTrack(id) {
    if (phase !== 'menu' && phase !== 'error') return false;
    const next = TRACKS.findIndex(track => track.id === id);
    if (next < 0) return false;
    index = next; message = ''; phase = 'menu'; notify(); return true;
  }
  function start() {
    if (phase !== 'menu' && phase !== 'error') return false;
    phase = 'loading'; message = ''; hover = null; focus = 'loading';
    abort = new AbortController();
    attempt = Object.freeze({id: ++serial, signal: abort.signal});
    const current = attempt;
    const selection = Object.freeze({trackId: TRACKS[index].id, settings: frozenSettings});
    notify();
    // An onChange subscriber may cancel the request before launch.
    if (attempt !== current || phase !== 'loading') return false;
    try {
      const result = onStart(selection, current);
      // Host explicitly calls ready/error. Catch rejected launch promises only.
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(error => fail(current.id, error));
      }
    } catch (error) { fail(current.id, error); }
    return true;
  }
  function ready(id) {
    if (phase !== 'loading' || id !== attempt?.id) return false;
    phase = 'playing'; message = ''; notify(); return true;
  }
  function fail(id, error = 'Unable to start this run.') {
    if (phase !== 'loading' || id !== attempt?.id) return false;
    invalidate(); phase = 'error'; focus = 'start';
    // The renderer uses a stable readable message, never raw exception text.
    message = 'START FAILED — TRY AGAIN';
    notify(); return true;
  }
  function activate(id) {
    if (phase === 'disposed' || phase === 'playing') return false;
    if (id === 'cancel') return phase === 'loading' ? reset() : false;
    if (phase === 'loading') return false;
    if (id === 'start') return start();
    if (id === 'back') { reset(); onBack(); return true; }
    return selectTrack(id);
  }
  function hotspots() {
    if (phase === 'loading') return [CANCEL_HOTSPOT];
    if (phase === 'playing' || phase === 'disposed') return [];
    return MENU_HOTSPOTS;
  }
  function pointer({u, v, type = 'move'} = {}) {
    if (type === 'leave' && phase !== 'disposed') { hover = null; notify(); return false; }
    if (!Number.isFinite(u) || !Number.isFinite(v) || phase === 'disposed') return false;
    const hit = hotspots().find(r => u >= r.u && u <= r.u + r.width &&
      v >= r.v && v <= r.v + r.height);
    if (type === 'move') {
      const next = hit?.id ?? null;
      if (next !== hover) { hover = next; notify(); }
      return !!hit;
    }
    if (!hit) return false;
    if (type === 'down') { focus = hit.id; notify(); return true; }
    if (type === 'up' || type === 'click' || type === 'activate') {
      focus = hit.id; return activate(hit.id);
    }
    return false;
  }
  function key({code, repeat = false, shiftKey = false} = {}) {
    if (phase === 'disposed' || phase === 'playing' || repeat) return false;
    if (code === 'Escape') {
      if (phase === 'loading') return reset();
      return activate('back');
    }
    if (phase === 'loading') {
      if(code === 'Tab') {focus = 'cancel';notify();return true;}
      return (code === 'Enter' || code === 'Space') && focus === 'cancel' ? activate('cancel') : false;
    }
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      const delta = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      focus = 'start'; return selectTrack(TRACKS[(index + delta + TRACKS.length) % TRACKS.length].id);
    }
    if (code === 'ArrowDown' || code === 'ArrowUp') {
      focus = focus === 'back' ? 'start' : 'back'; notify(); return true;
    }
    if (code === 'Tab') {
      const ids = MENU_HOTSPOTS.map(r => r.id);
      focus = ids[(ids.indexOf(focus) + (shiftKey ? ids.length - 1 : 1)) % ids.length];
      notify(); return true;
    }
    if (code === 'Enter' || code === 'Space') {
      if (TRACKS.some(track => track.id === focus)) {
        selectTrack(focus); focus = 'start'; notify(); return true;
      }
      return activate(focus);
    }
    return false;
  }
  function dispose() {
    if (phase === 'disposed') return;
    invalidate(); phase = 'disposed'; hover = null; notify();
  }
  return Object.freeze({getState, pointer, key, activate, selectTrack, start, ready,
    error: fail, cancel: reset, reset, dispose, getHotspots: () => Object.freeze(hotspots())});
}

/** Existing native game contract. This opens the chosen course's native menu. */
export function createRaceGptLaunchUrl(baseUrl, selection) {
  if (!TRACKS.some(track => track.id === selection?.trackId)) throw new Error('Unknown RaceGPT track');
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('RaceGPT launch requires an HTTP(S) game URL');
  }
  url.searchParams.set('track', selection.trackId);
  for (const key of ['autoplay', 'driver', 'qa', 'showcase', 'showcaseTitle', 'showcaseCopy', 'arcadeStart']) {
    url.searchParams.delete(key);
  }
  return url.href;
}

const C = Object.freeze({ink:'#07171e', panel:'#102b35', white:'#f2f4df', muted:'#a8c5c8',
  line:'#345560', amber:'#ffcc52', orange:'#ee5936', blue:'#64b9cf'});
const FONT = '"Arial Black", "Segoe UI", Arial, sans-serif';
const CONDENSED = '"Arial Narrow", "Bahnschrift", "Segoe UI", Arial, sans-serif';
function text(ctx, value, x, y, size, color = C.white, weight = 800, align = 'left', family = FONT) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}
function box(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
function line(ctx, points, color, width = 1, close = false) {
  ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  if (close) ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function polygon(ctx, points, color) {
  ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function checker(ctx, x, y, size, columns = 8, rows = 2) {
  for (let a=0;a<columns;a++) for(let b=0;b<rows;b++)
    box(ctx,x+a*size,y+b*size,size,size,(a+b)%2 ? C.ink : C.white);
}
function ring(ctx, x,y,r,color,width) {
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function route(ctx, track, time, reducedMotion) {
  const ox=758, oy=354, span=218;
  const points=track.route.map(([x,y])=>[ox+x*span,oy+y*span]);
  line(ctx,points,C.ink,21); line(ctx,points,C.white,12); line(ctx,points,C.panel,4);
  for(const [x,y] of track.gates) {
    const px=ox+x*span, py=oy+y*span;
    box(ctx,px-8,py-8,16,16,C.orange); box(ctx,px-3,py-3,6,6,C.white);
  }
  const end=points[points.length-1], first=points[0];
  ring(ctx,first[0],first[1],8,C.amber,4);
  checker(ctx,end[0]-9,end[1]-9,6,3,3);
  // One small ghost moving along the real sampled centerline. No flashing/glow.
  const n=reducedMotion ? 32 : Math.floor((time % 18000)/18000*(points.length-1));
  const [px,py]=points[n];
  ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fillStyle=C.amber;ctx.fill();
}

// Silver wedge, dark glass, four wheels and rear wing: the native procedural car.
// Painter's projection is Canvas2D artwork; no camera, 3D renderer, or game loop.
function car(ctx) {
  ctx.save(); ctx.translate(290,379); ctx.scale(0.94,0.94); ctx.rotate(-0.07);
  ctx.beginPath();ctx.ellipse(0,44,245,36,0,0,Math.PI*2);ctx.fillStyle='#041116';ctx.fill();
  const wheel=(x,y)=>{
    ctx.beginPath();ctx.ellipse(x,y,29,43,-0.1,0,Math.PI*2);ctx.fillStyle='#061015';ctx.fill();
    ctx.beginPath();ctx.ellipse(x-1,y,17,30,-0.1,0,Math.PI*2);ctx.fillStyle='#8b9ca2';ctx.fill();
    ctx.beginPath();ctx.ellipse(x-2,y,11,23,-0.1,0,Math.PI*2);ctx.fillStyle='#203943';ctx.fill();
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      line(ctx,[[x-2,y],[x-2+Math.cos(a)*11,y+Math.sin(a)*23]],'#c8d4d8',3);
    }
  };
  wheel(-142,26);wheel(154,25);
  polygon(ctx,[[-225,-23],[-127,-73],[90,-63],[221,-12],[207,37],[-203,40]],'#263d49');
  polygon(ctx,[[-225,-23],[-114,-75],[95,-66],[222,-13],[103,10],[-213,11]],'#b2c8cf');
  polygon(ctx,[[-213,11],[103,10],[222,-13],[208,25],[97,41],[-202,38]],'#647e8c');
  polygon(ctx,[[-213,11],[103,10],[97,27],[-205,23]],'#d6e0de');
  polygon(ctx,[[103,10],[222,-13],[211,15],[99,33]],'#c0d1d4');
  polygon(ctx,[[-125,-74],[-75,-126],[9,-124],[82,-67],[17,-46],[-100,-53]],'#1b2a35');
  polygon(ctx,[[-75,-126],[9,-124],[40,-111],[-51,-108]],'#e4ece8');
  polygon(ctx,[[9,-124],[40,-111],[104,-72],[82,-67]],'#c9d0d5');
  polygon(ctx,[[-70,-112],[-54,-103],[-19,-59],[-89,-65]],'#35566b');
  polygon(ctx,[[-49,-104],[33,-107],[84,-72],[0,-49]],'#203846');
  line(ctx,[[-47,-101],[-9,-57]],'#bdd0d6',4);
  line(ctx,[[-106,-51],[22,-42],[104,-65]],'#f2f4df',3);
  line(ctx,[[112,-13],[174,-33]],'#ebf3ef',3);
  polygon(ctx,[[123,-6],[154,-12],[157,-2],[124,5]],C.white);
  polygon(ctx,[[183,-21],[210,-27],[209,-18],[184,-10]],C.white);
  polygon(ctx,[[111,21],[206,-2],[202,11],[112,32]],'#132936');
  box(ctx,-207,-55,9,31,'#1b2a35');box(ctx,-133,-82,9,26,'#1b2a35');
  polygon(ctx,[[-240,-66],[-155,-106],[-109,-93],[-204,-49]],'#1b2a35');
  line(ctx,[[-238,-66],[-154,-105],[-111,-94]],'#a0b2b8',3);
  wheel(-147,42);wheel(93,42);
  line(ctx,[[-191,40],[-175,51]],C.orange,7);
  ctx.restore();
}
function outline(ctx,r,color=C.white,width=8,inset=-8) {
  ctx.strokeStyle=color;ctx.lineWidth=width;
  ctx.strokeRect(r.u*DESIGN.width+inset,r.v*DESIGN.height+inset,
    r.width*DESIGN.width-inset*2,r.height*DESIGN.height-inset*2);
}

/** Pure paint. Time is milliseconds from the host; updates at 10–15 Hz suffice. */
export function draw(ctx,{width=ctx.canvas.width,height=ctx.canvas.height,time=0,state,
  reducedMotion=false}={}) {
  time=Number.isFinite(time)?time:0;
  const view=state ?? {phase:'menu',index:0,trackId:TRACKS[0].id,focus:'start'};
  const track=TRACKS.find(track=>track.id===view.trackId) ?? TRACKS[0];
  const selected=TRACKS.indexOf(track);
  ctx.save();ctx.setTransform(width/DESIGN.width,0,0,height/DESIGN.height,0,0);
  box(ctx,0,0,960,1280,C.ink);
  // Deliberately sparse at the measured standing footprint. No tiny metadata.
  const bg=ctx.createLinearGradient(0,240,960,476);
  bg.addColorStop(0,'#184454');bg.addColorStop(1,'#0d252e');
  box(ctx,0,240,960,236,bg);
  polygon(ctx,[[-40,476],[370,240],[475,240],[65,476]],C.orange);
  polygon(ctx,[[118,476],[527,240],[547,240],[139,476]],'#9d3d2a');
  for(let i=0;i<5;i++)line(ctx,[[623+i*66,248],[553+i*66,470]],'#20424d',3);
  ctx.save();ctx.translate(47,154);ctx.transform(1,0,-0.16,1,0,0);
  text(ctx,'RACE',0,0,124,C.white,900);
  const wordWidth=ctx.measureText('RACE').width;
  text(ctx,'GPT',wordWidth+8,0,124,C.amber,900);
  ctx.restore();
  checker(ctx,852,62,20,3,3);
  const loading=view.phase==='loading', playing=view.phase==='playing', error=view.phase==='error';
  text(ctx,error?'START FAILED':'TIME ATTACK',480,222,error?72:56,error?C.orange:C.amber,900,'center');
  car(ctx);
  box(ctx,586,260,4,194,C.line);
  route(ctx,track,time,reducedMotion);
  text(ctx,`TRACK ${String.fromCharCode(65+selected)}`,480,563,104,C.white,900,'center');
  for(let i=0;i<4;i++) {
    const t=TRACKS[i],x=48+i*222,active=i===selected;
    box(ctx,x,588,198,120,active?C.amber:'#194853');
    text(ctx,String.fromCharCode(65+i),x+99,686,108,active?C.ink:C.white,900,'center');
    if(view.focus===t.id || view.hover===t.id) {
      outline(ctx,MENU_HOTSPOTS[i]);
    }
  }
  if(loading || playing) {
    box(ctx,48,740,864,184,C.panel);
    text(ctx,loading?'LOADING':'READY',480,852,112,C.white,900,'center');
    box(ctx,48,916,864,8,C.line);
    const progress=reducedMotion?0.5:(Math.sin(time/900)+1)/2;
    box(ctx,playing?48:48+progress*684,916,playing?864:180,8,C.amber);
  } else {
    box(ctx,48,740,864,184,C.amber);
    text(ctx,error?'RETRY':'START',480,842,124,C.ink,900,'center');
    text(ctx,'ENTER',480,904,72,C.ink,900,'center',CONDENSED);
    if(view.focus==='start' || view.hover==='start')outline(ctx,MENU_HOTSPOTS[4]);
  }
  // The three essential controls stay visible; condensed type fits safe gutters.
  for(const [i,key,label] of [[0,'W','GAS'],[1,'A D','STEER'],[2,'SPACE','BRAKE']]) {
    const x=48+i*296;
    box(ctx,x,964,272,104,C.panel);
    text(ctx,key,x+136,1046,key==='SPACE'?76:92,C.white,900,'center',CONDENSED);
    text(ctx,label,x+136,1140,76,C.white,900,'center',CONDENSED);
  }
  box(ctx,48,1176,864,80,C.panel);
  text(ctx,playing?'READY':loading?'ESC  CANCEL':'ESC  BACK',480,1238,84,C.white,900,'center',CONDENSED);
  const back=loading?CANCEL_HOTSPOT:MENU_HOTSPOTS[5];
  if(!playing && (view.focus===back.id || view.hover===back.id))outline(ctx,back);
  ctx.restore();
}
