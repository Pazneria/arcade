// A provisional central exterior position; it is not a surveyed path or an interior.
export function findCentralSpawn(data,nav){
 const cellhouse=data.buildings.find(b=>b.id===16050272);if(!cellhouse)return null;
 const candidates=[[69.5,-11.9],[69,-12],[68,-13],[50,-80]];
 for(const [x,z] of candidates){const h=nav.support(data,x,z);if(!h)continue;let clearance=Infinity;for(const b of data.buildings)for(let i=0;i<b.outline.length;i++)clearance=Math.min(clearance,nav.distanceToSegment(x,z,b.outline[i],b.outline[(i+1)%b.outline.length]));if(clearance<5)continue;let clear=true;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x,z,y:h[0],blocked:''};if(nav.move(data,q,dx,dz)<.999){clear=false;break}}if(!clear)continue;
  let nearest={d:Infinity,x:0,z:0};for(let i=0;i<cellhouse.outline.length;i++){const a=cellhouse.outline[i],b=cellhouse.outline[(i+1)%cellhouse.outline.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),px=a[0]+t*dx,pz=a[1]+t*dz,d=Math.hypot(px-x,pz-z);if(d<nearest.d)nearest={d,x:px,z:pz}}
  return {x,z,y:h[0],eye:1.7,yaw:Math.atan2(nearest.x-x,-(nearest.z-z)),pitch:.22,blocked:'',clearance};
 }
 return null;
}
