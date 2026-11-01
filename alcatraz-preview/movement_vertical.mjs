// First-person jump. Horizontal collision and its ground support remain owned by
// navigation; footY is an absolute world height and never below that support.
export const JUMP_SPEED=5.2;
export const GRAVITY=11.8;
export function createJumpState(groundY){
 if(!Number.isFinite(groundY))throw Error('Jump requires a finite support height');
 return {footY:groundY,velocity:0,grounded:true,held:false};
}
// Call on key transitions (or every frame): holding Space cannot trigger a
// second jump after landing; a release and another press are required.
export function setJumpHeld(state,held,groundY){
 const pressed=!!held&&!state.held;state.held=!!held;
 if(pressed&&state.grounded&&Number.isFinite(groundY)){
  state.footY=groundY;state.velocity=JUMP_SPEED;state.grounded=false;return true;
 }
 return false;
}
export function updateJump(state,groundY,dt,ceilingY=null,bodyHeight=1.8){
 if(!Number.isFinite(groundY))throw Error('Jump lost terrain support');
 const ceiling=Number.isFinite(ceilingY)?ceilingY-bodyHeight:Infinity;if(!Number.isFinite(bodyHeight)||bodyHeight<=0||ceiling<groundY-1e-7)throw Error('Invalid ceiling clearance');
 if(!Number.isFinite(dt)||dt<=0){if(state.grounded)state.footY=groundY;return state.footY}
 // The game already bounds frame delta to .1 s. Analytic integration is stable
 // and independent of frame rate on a stationary ground surface.
 dt=Math.min(dt,.1);
 if(state.grounded){state.footY=groundY;state.velocity=0;return state.footY}
 let next=state.footY+state.velocity*dt-.5*GRAVITY*dt*dt;
 state.velocity-=GRAVITY*dt;
 if(next>ceiling){next=ceiling;if(state.velocity>0)state.velocity=0}
 if(next<=groundY){state.footY=groundY;state.velocity=0;state.grounded=true}
 else state.footY=next;
 return state.footY;
}
