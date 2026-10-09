import {createPlayer,movePlayer,pixelRatio,canInteract,START} from './arcade-motion.js';

export function createArcadeController(THREE, renderer, world, {onTarget,onInspect,onHome,onPause,onResume,onFailure,onScreenLayout,container}) {
  const {scene,camera,anchors,targetMeshes,colliders}=world;
  const canvas=renderer.domElement,player=createPlayer(),keys=new Set(),listeners=[];
  const ray=new THREE.Raycaster(),point=new THREE.Vector2(),view=new THREE.Vector3();
  const before={x:player.x,z:player.z},reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let leaving=false,inspection=null,aislePose=null,freeLook=false,hadSceneLock=false,presentation=0,presentationLast=0,presenter=null;
  let disposed=false,started=false,active=false,raf=0,last=0,elapsed=0,lastRender=0,lastPick=0,target=null,gesture=null,touchMove=0,captureEpoch=0,captureRequestEpoch=-1,capturePending=false,ignoredUnlock=false;
  let touch=matchMedia('(pointer: coarse)').matches || innerWidth<768;
  const listen=(el,type,fn,options)=> {el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));};
  const editable=el=>el instanceof Element && !!el.closest('input,textarea,select,[contenteditable="true"]');
  function cameraPose() {
    // Inspection uses the player's eye, not a screen-normal camera dolly. The
    // cabinet's physical tilt remains visible and the lens never changes.
    camera.up.set(0,1,0);camera.position.set(player.x,player.eye,player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
    camera.updateMatrixWorld();
  }
  function screenLayout() {
    if(!inspection?.screen)return null;
    const screen=inspection.screen,rect=canvas.getBoundingClientRect();
    if(view.copy(camera.position).sub(screen.center).dot(screen.normal)<=0)return null;
    const points=screen.corners.map(c=>c.clone().project(camera));
    if(points.some(p=>p.z < -1 || p.z > 1))return null;
    const quad=points.map(p=>({x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}));
    return {quad,aspect:screen.width/screen.height};
  }
  function clearInput() {keys.clear();gesture=null;touchMove=0;}
  function resize() {
    touch=matchMedia('(pointer: coarse)').matches || innerWidth<768;
    renderer.setPixelRatio(pixelRatio(innerWidth,innerHeight,devicePixelRatio,touch));renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect=innerWidth/Math.max(1,innerHeight);camera.updateProjectionMatrix();
    if(!active&&!disposed) renderOnce();
  }
  function pick(x=innerWidth/2,y=innerHeight/2) {
    const rect=canvas.getBoundingClientRect();
    point.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);ray.setFromCamera(point,camera);
    const hit=ray.intersectObjects(targetMeshes,false)[0];
    if(!hit) return null;
    const anchor=hit.object.userData.anchor;
    if(anchor.screen&&view.copy(camera.position).sub(anchor.screen.center).dot(anchor.screen.normal)<=0)return null;
    // Opaque scene geometry must not hide the selected object. Transparent glow
    // sheets and the invisible interaction volumes are excluded from occlusion.
    const blocker=ray.intersectObjects(scene.children,true).find(i=>!i.object.userData.anchor && i.object.material && !i.object.material.transparent && i.object.material.visible!==false);
    return canInteract(hit.distance,blocker?.distance) ? anchor : null;
  }
  function containsCabinet(x,y) {
    if(!inspection?.interactionBounds||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const rect=canvas.getBoundingClientRect();
    point.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);ray.setFromCamera(point,camera);
    if(!ray.ray.intersectBox(inspection.interactionBounds,view))return false;
    const distance=ray.ray.origin.distanceTo(view);
    const blocker=ray.intersectObjects(scene.children,true).find(i=>!i.object.userData.anchor&&i.object.material&&!i.object.material.transparent&&i.object.material.visible!==false);
    return canInteract(distance,blocker?.distance);
  }
  function select(next) { if(next===target)return;target=next;onTarget(next); }
  function leaveHome() {if(disposed||!active||leaving)return;leaving=true;pause();onHome();}
  function activate(anchor) { if(!anchor||!active)return; if(anchor.kind==='home')leaveHome(); else onInspect(anchor.gameIndex); }
  function renderOnce() {
    if(disposed)return;
    try {cameraPose();scene.updateMatrixWorld(true);world.animate(elapsed,0);renderer.render(scene,camera);onScreenLayout?.(screenLayout());}
    catch(error) {if(!started)throw error;pause();onFailure(error);}
  }
  function frame(now) {
    if(!active||disposed)return;
    if(document.hidden||document.hasFocus?.()===false){pause();onPause('blur');return;}
    try {
    raf=requestAnimationFrame(frame);
    const dt=last?Math.min((now-last)/1000,0.05):0;last=now;elapsed+=dt;
    world.exits?.update(player,dt,{reducedMotion:reducedMotion.matches});
    before.x=player.x;before.z=player.z;
    movePlayer(player,{forward:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+touchMove,strafe:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),run:keys.has('ShiftLeft')||keys.has('ShiftRight')},dt,colliders);
    if(world.exits?.crossed(before,player)){leaveHome();return;}
    cameraPose();
    if(touch && now-lastRender<1000/30)return;
    lastRender=now;scene.updateMatrixWorld(true);world.animate(elapsed,dt);renderer.render(scene,camera);
    if(now-lastPick>=80){lastPick=now;select(pick());}
    } catch(error) {pause();onFailure(error);}
  }
  function pause() {
    active=false;captureEpoch++;cancelAnimationFrame(raf);raf=0;last=0;clearInput();select(null);
    world.exits?.cancel();
    if(document.pointerLockElement===canvas){ignoredUnlock=true;document.exitPointerLock();}
  }
  function stopPresentation(){cancelAnimationFrame(presentation);presentation=0;presentationLast=0;presenter=null;}
  function present(update) {
    stopPresentation();if(disposed||!inspection)return;
    presenter=update;
    function tick(now){
      presentation=0;if(disposed||!inspection||!presenter||document.hidden||document.hasFocus?.()===false){stopPresentation();return;}
      const dt=presentationLast?Math.min(.05,(now-presentationLast)/1000):0;presentationLast=now;
      try{presenter(dt,now);renderOnce();if(presenter)presentation=requestAnimationFrame(tick);}
      catch(error){stopPresentation();onFailure(error);}
    }
    presentation=requestAnimationFrame(tick);
  }
  function resume(options) {if(disposed||leaving||document.hidden||document.hasFocus?.()===false)return;if(options)freeLook=!!options.freeLook;active=true;last=0;if(!raf)raf=requestAnimationFrame(frame);}
  function rejectLateLock() {if(document.pointerLockElement===canvas){ignoredUnlock=true;document.exitPointerLock();}}
  async function capture() {
    if(touch||disposed||!active||capturePending)return;const token=captureEpoch;captureRequestEpoch=token;capturePending=true;
    try{await canvas.requestPointerLock?.();}catch{/* Drag look remains available. */}
    finally{capturePending=false;if(disposed||!active||token!==captureEpoch)rejectLateLock();}
  }
  function focusGame(index,{approach=false}={}) {
    const anchor=anchors.find(a=>a.gameIndex===index);if(!anchor)return;
    if(!aislePose)aislePose={...player};pause();stopPresentation();inspection=anchor;
    if(approach||!anchor.screen) {
      player.x=anchor.approach.x;player.z=anchor.approach.z;player.eye=1.62;player.crouch=false;
      // Only an explicit directory approach positions/aims the standing view.
      // A natural click or ray selection keeps the complete current eye pose.
      view.copy(anchor.position).sub(new THREE.Vector3(player.x,player.eye,player.z));
      player.yaw=Math.atan2(-view.x,-view.z);player.pitch=Math.atan2(view.y,Math.hypot(view.x,view.z));
    }
    renderOnce();
  }
  function returnToAisle(){stopPresentation();inspection=null;if(aislePose)Object.assign(player,aislePose);aislePose=null;renderOnce();}
  listen(window,'resize',()=>{try{resize();}catch(error){pause();onFailure(error);}});
  listen(window,'blur',()=>{pause();stopPresentation();onPause('blur');});
  listen(document,'visibilitychange',()=>{if(document.hidden){pause();stopPresentation();onPause('visibility');}});
  listen(document,'pointerlockchange',()=>{
    if(document.pointerLockElement===canvas){if(!active||disposed||captureRequestEpoch!==captureEpoch)rejectLateLock();else{hadSceneLock=true;ignoredUnlock=false;}return;}
    const owned=hadSceneLock;hadSceneLock=false;clearInput();if(ignoredUnlock){ignoredUnlock=false;return;}if(owned&&active){pause();onPause('unlock');}
  });
  listen(window,'keydown',e=>{
    if(e.defaultPrevented||editable(e.target))return;
    if(e.code==='Escape'){if(!e.repeat){pause();onPause('help');}return;}
    if(!active)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();activate(pick());}
    if(e.code==='KeyR'&&!e.repeat){world.exits?.cancel();Object.assign(player,START);player.crouch=false;}
    if(e.code==='KeyC'&&!e.repeat)player.crouch=!player.crouch;
    if(e.code==='Tab'){pause();onPause('keyboard');}
  });
  listen(window,'keyup',e=>keys.delete(e.code));
  listen(canvas,'pointerdown',e=>{
    if(e.button!==undefined&&e.button!==0)return;
    if(!active)onResume?.();if(!active)return;
    if(document.pointerLockElement===canvas){activate(pick());return;}
    // Select an unlocked cabinet directly. Asking for lock first can consume
    // the same click that should release the cursor onto its screen controls.
    const anchor=pick(e.clientX,e.clientY);
    if(!touch&&anchor?.kind==='game'){e.preventDefault();activate(anchor);return;}
    canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};
    if(!touch&&e.button===0)capture();
  });
  listen(canvas,'focus',()=>{if(!active)onResume?.();});
  listen(canvas,'pointermove',e=>{
    if(!active)return;
    const locked=document.pointerLockElement===canvas;
    const dragging=gesture?.id===e.pointerId,hover=freeLook&&!gesture&&e.pointerType!=='touch';
    if(!locked&&!dragging&&!hover)return;
    const dx=locked||hover?(e.movementX||0):e.clientX-gesture.x,dy=locked||hover?(e.movementY||0):e.clientY-gesture.y;
    player.yaw-=Math.max(-250,Math.min(250,dx))*0.0021;player.pitch=Math.max(-1.45,Math.min(1.45,player.pitch-dy*0.0021));
    if(gesture){gesture.x=e.clientX;gesture.y=e.clientY;gesture.dragged ||= Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>6;}
  });
  listen(canvas,'pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    const tap=!gesture.dragged;gesture=null;
    if(tap)activate(pick(e.clientX,e.clientY));
  });
  for(const event of ['pointercancel','lostpointercapture'])listen(canvas,event,()=>{gesture=null;touchMove=0;});
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();pause();onFailure();});
  canvas.setAttribute('tabindex','0');canvas.setAttribute('aria-label','Arcade scene. Move with WASD or arrow keys. Click a nearby cabinet to use its screen. Click outside the cabinet or press Escape to return to mouse look.');
  function dispose() {if(disposed)return;stopPresentation();pause();disposed=true;listeners.splice(0).forEach(remove=>remove());world.dispose();renderer.setAnimationLoop(null);renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  try {container.append(canvas);resize();renderOnce();started=true;} catch(error) {dispose();throw error;}
  return {player,pause,resume,capture,focusGame,present,stopPresentation,dispose,returnToAisle,containsCabinet,
    get cabinet(){return inspection;},getScreenLayout:screenLayout,
    reset(){stopPresentation();world.exits?.cancel();inspection=null;aislePose=null;Object.assign(player,START);renderOnce();},setTouchMove(value){touchMove=value;},get active(){return active;}};
}
