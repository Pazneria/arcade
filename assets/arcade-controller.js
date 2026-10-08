import {createPlayer,movePlayer,pixelRatio,canInteract,START} from './arcade-motion.js';

export function createArcadeController(THREE, renderer, world, {onTarget,onInspect,onHome,onPause,onFailure,container}) {
  const {scene,camera,anchors,targetMeshes,colliders}=world;
  const canvas=renderer.domElement,player=createPlayer(),keys=new Set(),listeners=[];
  const ray=new THREE.Raycaster(),point=new THREE.Vector2(),view=new THREE.Vector3();
  let disposed=false,started=false,active=false,raf=0,last=0,elapsed=0,lastRender=0,lastPick=0,target=null,gesture=null,touchMove=0;
  let touch=matchMedia('(pointer: coarse)').matches || innerWidth<768;
  const listen=(el,type,fn,options)=> {el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));};
  const editable=el=>el instanceof Element && !!el.closest('input,textarea,select,[contenteditable="true"]');
  function cameraPose() {camera.position.set(player.x,player.eye,player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');camera.updateMatrixWorld();}
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
    // Opaque scene geometry must not hide the selected object. Transparent glow
    // sheets and the invisible interaction volumes are excluded from occlusion.
    const blocker=ray.intersectObjects(scene.children,true).find(i=>!i.object.userData.anchor && i.object.material && !i.object.material.transparent && i.object.material.visible!==false);
    return canInteract(hit.distance,blocker?.distance) ? hit.object.userData.anchor : null;
  }
  function select(next) { if(next===target)return;target=next;onTarget(next); }
  function activate(anchor) { if(!anchor||!active)return; if(anchor.kind==='home')onHome(); else onInspect(anchor.gameIndex); }
  function renderOnce() {
    if(disposed)return;
    try {cameraPose();scene.updateMatrixWorld(true);world.animate(elapsed,0);renderer.render(scene,camera);}
    catch(error) {if(!started)throw error;pause();onFailure(error);}
  }
  function frame(now) {
    if(!active||disposed)return;
    try {
    raf=requestAnimationFrame(frame);
    const dt=last?Math.min((now-last)/1000,0.05):0;last=now;elapsed+=dt;
    movePlayer(player,{forward:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+touchMove,strafe:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),run:keys.has('ShiftLeft')||keys.has('ShiftRight')},dt,colliders);
    cameraPose();
    if(touch && now-lastRender<1000/30)return;
    lastRender=now;scene.updateMatrixWorld(true);world.animate(elapsed,dt);renderer.render(scene,camera);
    if(now-lastPick>=80){lastPick=now;select(pick());}
    } catch(error) {pause();onFailure(error);}
  }
  function pause() {
    active=false;cancelAnimationFrame(raf);raf=0;last=0;clearInput();select(null);
    if(document.pointerLockElement===canvas)document.exitPointerLock();
  }
  function resume() {if(disposed||document.hidden)return;active=true;last=0;if(!raf)raf=requestAnimationFrame(frame);}
  async function capture() {if(touch||disposed||!active)return;try{await canvas.requestPointerLock?.();}catch{/* Drag look remains available. */}}
  function focusGame(index) {
    const anchor=anchors.find(a=>a.gameIndex===index);if(!anchor)return;
    pause();player.x=anchor.approach.x;player.z=anchor.approach.z;player.eye=1.62;
    view.copy(anchor.position).sub(new THREE.Vector3(player.x,player.eye,player.z));
    player.yaw=Math.atan2(-view.x,-view.z);player.pitch=Math.atan2(view.y,Math.hypot(view.x,view.z));
    renderOnce();
  }
  listen(window,'resize',()=>{try{resize();}catch(error){pause();onFailure(error);}});
  listen(window,'blur',()=>{pause();onPause();});
  listen(document,'visibilitychange',()=>{if(document.hidden){pause();onPause();}});
  listen(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas){clearInput();if(active){pause();onPause();}}});
  listen(window,'keydown',e=>{
    if(editable(e.target))return;
    if(e.code==='Escape'){pause();onPause();return;}
    if(!active)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();activate(pick());}
    if(e.code==='KeyR'&&!e.repeat){Object.assign(player,START);player.crouch=false;}
    if(e.code==='KeyC'&&!e.repeat)player.crouch=!player.crouch;
    if(e.code==='Tab'){pause();onPause();}
  });
  listen(window,'keyup',e=>keys.delete(e.code));
  listen(canvas,'pointerdown',e=>{
    if(!active)return;
    if(document.pointerLockElement===canvas){activate(pick());return;}
    canvas.setPointerCapture(e.pointerId);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};
  });
  listen(canvas,'pointermove',e=>{
    if(!active)return;
    const locked=document.pointerLockElement===canvas;
    if(!locked && (!gesture||gesture.id!==e.pointerId))return;
    const dx=locked?e.movementX:e.clientX-gesture.x,dy=locked?e.movementY:e.clientY-gesture.y;
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
  canvas.setAttribute('aria-label','3D arcade. Use Explore for movement, or Games for accessible links.');
  function dispose() {if(disposed)return;pause();disposed=true;listeners.splice(0).forEach(remove=>remove());world.dispose();renderer.setAnimationLoop(null);renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  try {container.append(canvas);resize();renderOnce();started=true;} catch(error) {dispose();throw error;}
  return {player,pause,resume,capture,focusGame,dispose,reset(){Object.assign(player,START);renderOnce();},setTouchMove(value){touchMove=value;},get active(){return active;}};
}
