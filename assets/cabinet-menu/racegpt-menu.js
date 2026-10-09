import { TRACKS } from './track-art.js';
export { TRACKS };

export const DESIGN = Object.freeze({width: 1280, height: 960});
const rect = (id, x, y, w, h, label) => Object.freeze({
  id, label, u: x / DESIGN.width, v: y / DESIGN.height,
  width: w / DESIGN.width, height: h / DESIGN.height
});
export const MENU_HOTSPOTS = Object.freeze([
  ...TRACKS.map((track, i) => rect(track.id, 64 + i * 292, 584, 276, 116, track.name)),
  rect('start', 64, 728, 852, 108, 'Start run'),
  rect('back', 940, 728, 276, 108, 'Back to arcade')
]);
export const CANCEL_HOTSPOT = rect('cancel', 940, 728, 276, 108, 'Cancel loading');

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
function text(ctx, value, x, y, size, color = C.white, weight = 800, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
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
  const ox=1108, oy=424, span=194;
  const points=track.route.map(([x,y])=>[ox+x*span,oy+y*span]);
  line(ctx,points,C.ink,17); line(ctx,points,C.muted,9); line(ctx,points,C.panel,3);
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
  ctx.save(); ctx.translate(344,455); ctx.rotate(-0.07);
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
function keycap(ctx,label,x,y,w=68) {
  box(ctx,x,y,w,43,C.panel);line(ctx,[[x,y+43],[x,y],[x+w,y],[x+w,y+43]],C.muted,2);
  text(ctx,label,x+w/2,y+31,25,C.white,800,'center');
}

/** Pure paint. Time is milliseconds from the host; updates at 10–15 Hz suffice. */
export function draw(ctx,{width=ctx.canvas.width,height=ctx.canvas.height,time=0,state,
  reducedMotion=false}={}) {
  time=Number.isFinite(time)?time:0;
  const view=state ?? {phase:'menu',index:0,trackId:TRACKS[0].id,focus:'start'};
  const track=TRACKS.find(track=>track.id===view.trackId) ?? TRACKS[0];
  const selected=TRACKS.indexOf(track);
  ctx.save();ctx.setTransform(width/1280,0,0,height/960,0,0);
  box(ctx,0,0,1280,960,C.ink);
  // Fixed geometry, broad colors and safe gutters survive standing perspective.
  const bg=ctx.createLinearGradient(0,250,1100,610);
  bg.addColorStop(0,'#184454');bg.addColorStop(1,'#0d252e');
  polygon(ctx,[[0,280],[1280,244],[1280,561],[0,561]],bg);
  polygon(ctx,[[0,361],[629,275],[764,538],[0,544]],'#13333e');
  polygon(ctx,[[-40,562],[478,285],[564,285],[54,562]],C.orange);
  polygon(ctx,[[94,562],[605,285],[624,285],[116,562]],'#9d3d2a');
  for(let i=0;i<8;i++)line(ctx,[[735+i*61,290],[643+i*61,553]],'#20424d',2);
  box(ctx,64,44,12,23,C.amber);
  text(ctx,'PRIVATE TEST FACILITY',91,65,25,C.muted);
  text(ctx,'TIME ATTACK',1216,65,25,C.amber,800,'right');
  ctx.save();ctx.translate(63,234);ctx.transform(1,0,-0.16,1,0,0);
  text(ctx,'RACE',0,0,158,C.white,900);
  const wordWidth=ctx.measureText('RACE').width;
  text(ctx,'GPT',wordWidth+10,0,158,C.amber,900);
  ctx.restore();
  checker(ctx,1096,118,20,6,3);
  text(ctx,'ONE CAR. ONE CLEAN RUN.',64,286,32,C.white);
  car(ctx);
  box(ctx,732,320,2,209,C.line);
  text(ctx,track.label.toUpperCase(),778,341,23,C.muted);
  const names=[['BANKED','SHAKEDOWN'],['HIGH SPEED','ROUTE'],['TECHNICAL','BOWL'],['JUMP','SPEEDCHECK']];
  text(ctx,names[selected][0],778,402,26,C.white);
  text(ctx,names[selected][1],778,438,26,C.white);
  route(ctx,track,time,reducedMotion);
  text(ctx,`${track.checkpoints} CHECKPOINT${track.checkpoints>1?'S':''}`,778,485,22,C.muted);
  text(ctx,'MODEL GHOST',778,541,22,C.amber);
  for(let i=0;i<4;i++) {
    const t=TRACKS[i],x=64+i*292,active=i===selected;
    box(ctx,x,584,276,116,active?C.amber:C.panel);
    box(ctx,x,584,276,5,active?C.white:C.line);
    text(ctx,String(i+1).padStart(2,'0'),x+17,645,40,active?C.ink:C.muted,900);
    text(ctx,`TRACK ${String.fromCharCode(65+i)}`,x+82,627,27,active?C.ink:C.white);
    text(ctx,t.hint,x+17,678,20,active?C.ink:C.muted);
    if(view.focus===t.id || view.hover===t.id) {
      ctx.strokeStyle=C.white;ctx.lineWidth=4;ctx.strokeRect(x-5,579,286,126);
    }
  }
  const loading=view.phase==='loading', playing=view.phase==='playing', error=view.phase==='error';
  if(loading || playing) {
    box(ctx,64,728,852,108,C.panel);
    text(ctx,loading?'PREPARING YOUR RUN':'RUN READY',96,798,42,C.white);
    box(ctx,940,728,276,108,C.panel);
    text(ctx,loading?'CANCEL':'READY',1078,791,32,C.amber,800,'center');
    if(loading && (view.focus==='cancel' || view.hover==='cancel')) {
      ctx.strokeStyle=C.white;ctx.lineWidth=4;ctx.strokeRect(934,722,288,120);
    }
    box(ctx,64,830,1152,6,C.line);
    const progress=reducedMotion?0.5:(Math.sin(time/900)+1)/2;
    box(ctx,playing?64:64+progress*976,830,playing?1152:176,6,C.amber);
  } else {
    box(ctx,64,728,852,108,C.amber);
    box(ctx,64,728,10,108,C.white);
    text(ctx,error?'RETRY RUN':'START RUN',96,800,52,C.ink,900);
    text(ctx,'ENTER  →',872,796,30,C.ink,800,'right');
    box(ctx,940,728,276,108,C.panel);
    text(ctx,'BACK',1078,795,35,C.white,800,'center');
    for(const r of MENU_HOTSPOTS.slice(4)) if(view.focus===r.id || view.hover===r.id) {
      ctx.strokeStyle=C.white;ctx.lineWidth=4;
      ctx.strokeRect(r.u*1280-6,r.v*960-6,r.width*1280+12,r.height*960+12);
    }
  }
  if(error) {
    text(ctx,'START FAILED — TRY AGAIN',64,875,22,C.orange);
  } else {
    text(ctx,'←  →  CHOOSE TRACK',64,875,22,C.muted);
    text(ctx,'ESC  BACK',1216,875,22,C.muted,800,'right');
  }
  keycap(ctx,'W / ↑',64,899,100);text(ctx,'GAS',176,929,24,C.white);
  keycap(ctx,'A D / ← →',333,899,169);text(ctx,'STEER',514,929,24,C.white);
  keycap(ctx,'SPACE',738,899,125);text(ctx,'BRAKE',875,929,24,C.white);
  text(ctx,'R  RESET',1216,929,23,C.muted,800,'right');
  ctx.restore();
}
