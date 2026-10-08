export const START = Object.freeze({x:0, z:-0.95, yaw:0, pitch:-0.04});
export function createPlayer() { return {...START, eye:1.62, crouch:false}; }
export function movePlayer(player, input, dt, colliders, radius=0.27) {
  const len = Math.hypot(input.forward, input.strafe) || 1;
  const speed = player.crouch ? 1.1 : input.run ? 3.4 : 1.9;
  const sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  const dx=(-sy*input.forward+cy*input.strafe)/len*speed*dt;
  const dz=(-cy*input.forward-sy*input.strafe)/len*speed*dt;
  // Small swept steps stop thin walls and cabinet edges from being tunneled.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(radius*0.45)));
  for(let step=0;step<steps;step++) {
    player.x+=dx/steps; player.z+=dz/steps;
    for(let pass=0;pass<3;pass++) for(const c of colliders) {
      const cx=Math.max(c.x0,Math.min(player.x,c.x1)),cz=Math.max(c.z0,Math.min(player.z,c.z1));
      const ax=player.x-cx,az=player.z-cz,d2=ax*ax+az*az;
      if(d2>=radius*radius) continue;
      if(d2>1e-10) { const d=Math.sqrt(d2),push=(radius-d)/d; player.x+=ax*push; player.z+=az*push; }
      else { const sides=[player.x-c.x0,c.x1-player.x,player.z-c.z0,c.z1-player.z]; const i=sides.indexOf(Math.min(...sides)); if(i===0)player.x=c.x0-radius; else if(i===1)player.x=c.x1+radius; else if(i===2)player.z=c.z0-radius; else player.z=c.z1+radius; }
    }
  }
  player.eye+=( (player.crouch?1.12:1.62)-player.eye )*(1-Math.exp(-dt*16));
}
export function pixelRatio(width,height,dpr,touch) {
  const budget=touch?900000:2304000;
  return Math.min(Math.max(0.1,dpr||1),touch?1.25:1.5,Math.sqrt(budget/Math.max(1,width*height)));
}
export function canInteract(distance,occluderDistance,maxDistance=2.6) {
  return distance<=maxDistance && (occluderDistance===undefined || occluderDistance+0.25>=distance);
}
