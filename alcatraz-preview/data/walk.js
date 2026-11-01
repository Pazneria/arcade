/* First-person terrain navigation, shared with Node tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AlcatrazWalk=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const RADIUS=.35, MAX_SLOPE=Math.tan(35*Math.PI/180), STEP=.2, OFFSETS=[[0,0],[RADIUS,0],[-RADIUS,0],[0,RADIUS],[0,-RADIUS],[RADIUS/Math.SQRT2,RADIUS/Math.SQRT2],[RADIUS/Math.SQRT2,-RADIUS/Math.SQRT2],[-RADIUS/Math.SQRT2,RADIUS/Math.SQRT2],[-RADIUS/Math.SQRT2,-RADIUS/Math.SQRT2]];
 function terrainHeight(t,x,z){if(typeof t.sampleHeight==='function')return t.sampleHeight(x,z);const fx=(x-t.x0)/t.spacing,fz=(z-t.z0)/t.spacing,c=Math.floor(fx),r=Math.floor(fz);if(r<0||c<0||r>=t.values.length-1||c>=t.values[0].length-1||!t.cell_land[r]?.[c])return null;const a=t.values[r][c],b=t.values[r][c+1],d=t.values[r+1][c],e=t.values[r+1][c+1];if([a,b,d,e].some(v=>v===null||!Number.isFinite(v)))return null;const u=fx-c,v=fz-r;return u>=v?a+u*(b-a)+v*(e-b):a+u*(e-d)+v*(d-a)}
 function inside(poly,x,z){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))result=!result}return result}
 function distanceToSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;if(!den)return Math.hypot(x-a[0],z-a[1]);const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/den));return Math.hypot(x-(a[0]+t*dx),z-(a[1]+t*dz))}
 function hitsBuilding(buildings,x,z,groundY){for(const b of buildings){const p=b.outline;if(b.id===15944616){ // Match open rendered tank, legs and approximate visible cross-braces.
 const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),cx=(xmin+xmax)/2,cz=(zmin+zmax)/2,radius=.46*Math.min(xmax-xmin,zmax-zmin),k=radius*.65,base=b.base,tankBottom=b.roof_elevation_navd88-6,hasY=Number.isFinite(groundY),head=groundY+1.8;
 if(!hasY||head>=base&&groundY<=tankBottom)for(const dx of [-k,k])for(const dz of [-k,k])if(Math.hypot(x-(cx+dx),z-(cz+dz))<=RADIUS+.22)return true;
 if(hasY&&head>=tankBottom&&groundY<=b.roof_elevation_navd88&&Math.hypot(x-cx,z-cz)<=RADIUS+radius)return true;
 if(hasY&&head>=base&&groundY<=tankBottom){const lo=Math.max(0,(groundY-base)/(tankBottom-base)),hi=Math.min(1,(head-base)/(tankBottom-base));if(lo<=hi){
  // Each brace runs bottom-to-top; project its player-height slice onto x-z.
  function brace(ax,az,bx,bz){return distanceToSegment(x,z,[ax+(bx-ax)*lo,az+(bz-az)*lo],[ax+(bx-ax)*hi,az+(bz-az)*hi])<=RADIUS+.11}
  for(const sign of [-1,1])if(brace(cx-k,cz+sign*k,cx+k,cz+sign*k)||brace(cx+k,cz+sign*k,cx-k,cz+sign*k)||brace(cx+sign*k,cz-k,cx+sign*k,cz+k)||brace(cx+sign*k,cz+k,cx+sign*k,cz-k))return true;
 }}continue
 }if(inside(p,x,z))return true;for(let i=0;i<p.length;i++)if(distanceToSegment(x,z,p[i],p[(i+1)%p.length])<=RADIUS)return true}return false}

 function terrainDiskValid(t,x,z){if(typeof t.isValidDisk==='function')return t.isValidDisk(x,z,RADIUS);const c0=Math.floor((x-RADIUS-t.x0)/t.spacing),c1=Math.floor((x+RADIUS-t.x0)/t.spacing),r0=Math.floor((z-RADIUS-t.z0)/t.spacing),r1=Math.floor((z+RADIUS-t.z0)/t.spacing);for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x0=t.x0+c*t.spacing,z0=t.z0+r*t.spacing,dx=Math.max(x0-x,0,x-(x0+t.spacing)),dz=Math.max(z0-z,0,z-(z0+t.spacing));if(dx*dx+dz*dz<=RADIUS*RADIUS&&(!t.cell_land[r]||!t.cell_land[r][c]))return false}return true}
 function stairHeight(steps,x,z){let best=null;for(const s of steps||[]){const dx=x-s.cx,dz=z-s.cz;if(Math.abs(dx*s.tx+dz*s.tz)<=s.halfWidth+1e-9&&Math.abs(dx*s.nx+dz*s.nz)<=s.halfDepth+1e-9&&(best===null||s.top>best))best=s.top}return best}
 function support(scene,x,z){const groundY=terrainHeight(scene.terrain,x,z);if(groundY===null||hitsBuilding(scene.buildings,x,z,groundY)||hitsBuilding(scene.landmarkColliders||[],x,z,groundY)||!terrainDiskValid(scene.terrain,x,z))return null;let h=[],onStep=[];for(const [dx,dz] of OFFSETS){const px=x+dx,pz=z+dz,v=terrainHeight(scene.terrain,px,pz);if(v===null)return null;const step=stairHeight(scene.walkableSteps,px,pz);onStep.push(step!==null&&step>v);h.push(step===null?v:Math.max(v,step))}h.onStep=onStep;return h}
 function gentleStart(scene,x,z){const h=support(scene,x,z);return h&&h.slice(1).every(y=>Math.abs(y-h[0])/RADIUS<=MAX_SLOPE)}
 function findStart(scene){const bx=-84,bz=-107;for(let rad=0;rad<=180;rad+=2){let choices=[];for(let i=-rad;i<=rad;i+=2){choices.push([bx+i,bz-rad],[bx+i,bz+rad]);if(Math.abs(i)<rad)choices.push([bx-rad,bz+i],[bx+rad,bz+i])}for(const [x,z] of choices)if(gentleStart(scene,x,z)){const goal=scene.buildings.find(b=>b.id===16050272);let yaw=0,pitch=0;const ground=support(scene,x,z)[0];if(goal){const cx=goal.outline.reduce((s,p)=>s+p[0],0)/goal.outline.length,cz=goal.outline.reduce((s,p)=>s+p[1],0)/goal.outline.length;yaw=Math.atan2(cx-x,-(cz-z));pitch=Math.atan2(goal.base+.55*goal.height-(ground+1.7),Math.hypot(cx-x,cz-z))}return {x,z,y:ground,yaw,pitch,eye:1.7,blocked:''}}}return null}
 // Bound vertical speed by scaling the horizontal substep, rather than using
 // a slope cutoff. Feet remain exactly on the sampled heightfield. 2.5 m of
 // height per metre of requested movement is a gameplay rate, not a grade rule.
 const VERTICAL_PER_TRAVEL=2.5;
 function move(scene,walker,dx,dz){
  const length=Math.hypot(dx,dz);if(!length)return 0;
  const count=Math.ceil(length/STEP),sx=dx/count,sz=dz/count,ds=length/count;let moved=0,prev=support(scene,walker.x,walker.z);
  if(!prev){walker.blocked='Current position is outside safe land.';return 0}
  function acceptable(next,budget){if(!next)return false;return next.every((v,j)=>{const rise=Math.abs(v-prev[j]);if(next.onStep[j]||prev.onStep[j])return rise<=Math.max(.22,budget)+1e-9;return rise<=budget+1e-9})}
  function tryVector(vx,vz,budget){
   if(!vx&&!vz)return null;
   let next=support(scene,walker.x+vx,walker.z+vz);
   if(!next)return null; // solid or world edge: let caller slide along it
   let f=1;if(!acceptable(next,budget)){
    let lo=0,hi=1;for(let k=0;k<18;k++){const mid=(lo+hi)/2,q=support(scene,walker.x+vx*mid,walker.z+vz*mid);if(acceptable(q,budget))lo=mid;else hi=mid}
    f=lo;if(f<1e-5)return null;next=support(scene,walker.x+vx*f,walker.z+vz*f);if(!next)return null;
   }
   walker.x+=vx*f;walker.z+=vz*f;walker.y=next[0];prev=next;return Math.hypot(vx*f,vz*f)
  }
  for(let i=0;i<count;i++){
   const full=tryVector(sx,sz,ds*VERTICAL_PER_TRAVEL);if(full!==null){moved+=full;walker.blocked='';continue}
   // A diagonal into a wall or edge should continue along its free axis.
   const x=tryVector(sx,0,Math.abs(sx)*VERTICAL_PER_TRAVEL)||0;
   const z=tryVector(0,sz,Math.abs(sz)*VERTICAL_PER_TRAVEL)||0;
   moved+=Math.hypot(x,z);walker.blocked=(x||z)?'':'Blocked by visible structure or world edge.';
   if(!x&&!z)break;
  }
  return moved
 }
 return {terrainHeight,stairHeight,inside,distanceToSegment,hitsBuilding,terrainDiskValid,support,findStart,move,RADIUS,MAX_SLOPE,STEP,VERTICAL_PER_TRAVEL};
});
