// Temporary free-fly inspection camera. Rendering/world data and walker collision
// are unchanged. The caller must freeze walking/jump physics while active.
export const SKY_SPEED=12, SKY_FAST_SPEED=30;
export function enterSkyCam(walker,cameraY=walker.y+walker.eye){
 if(!walker||![walker.x,walker.y,walker.z,walker.yaw,walker.pitch,walker.eye,cameraY].every(Number.isFinite))throw new Error('Invalid walking camera state');
 return {x:walker.x,y:cameraY,z:walker.z,yaw:walker.yaw,pitch:walker.pitch,savedWalker:{...walker}};
}
export function exitSkyCam(state){if(!state?.savedWalker)throw new Error('No saved walking position');return {...state.savedWalker}}
// forward/side/up are intended input directions in [-1,1]. Pitch is respected
// for forward flight; Q/E vertical adjustment is world-relative.
export function moveSkyCam(state,{forward=0,side=0,up=0,fast=false},dt){
 if(!state||![forward,side,up,dt].every(Number.isFinite)||dt<=0)return;
 const sy=Math.sin(state.yaw),cy=Math.cos(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);
 let dx=forward*sy*cp+side*cy,dy=forward*sp+up,dz=-forward*cy*cp+side*sy;
 const length=Math.hypot(dx,dy,dz);if(!length)return;
 const step=(fast?SKY_FAST_SPEED:SKY_SPEED)*Math.min(dt,.1)/Math.max(1,length);
 state.x+=dx*step;state.y+=dy*step;state.z+=dz*step;
}
