// Scene-local door placement. Catalog and destination routing remain elsewhere.
export const EXIT_DOORS = Object.freeze([
  {id:'home-entrance',x:0,z:0,width:1.92,direction:1,panelZ:-.025,depth:.16,
    panels:[{offset:-.5,width:1,travel:-1.02},{offset:.5,width:1,travel:1.02}]},
  {id:'home-exit',x:-2.75,z:-11,width:.9,direction:-1,panelZ:.045,depth:.13,
    panels:[{offset:0,width:.9,travel:1.02}]}
]);

export function createSlidingExits(onChange=()=>{}) {
  const radius=.27,threshold=.18;
  const doors=EXIT_DOORS.map(spec=>({spec,progress:0,open:0,wanted:false,armed:false,
    colliders:spec.panels.map(()=>({x0:0,x1:0,z0:0,z1:0}))}));
  const colliders=doors.flatMap(door=>door.colliders);
  let disposed=false,departed=false;
  function place(door) {
    const {spec,open}=door;
    spec.panels.forEach((panel,index)=>{
      const center=spec.x+panel.offset+panel.travel*open,c=door.colliders[index];
      c.x0=center-panel.width/2;c.x1=center+panel.width/2;
      c.z0=spec.z+spec.panelZ-spec.depth/2;c.z1=spec.z+spec.panelZ+spec.depth/2;
    });
    onChange(spec,open);
  }
  doors.forEach(place);
  function update(player,dt,{active=true,focused=true,reducedMotion=false}={}) {
    if(disposed||departed||!active||!focused||!Number.isFinite(player.x)||!Number.isFinite(player.z))return;
    for(const door of doors) {
      const {spec}=door,lateral=Math.abs(player.x-spec.x),out=spec.direction*(player.z-spec.z);
      const near=lateral<=spec.width/2+.45&&out>=-1.55&&out<=.65;
      if(near)door.wanted=true;
      else if(lateral>spec.width/2+.65||out< -2||out>.85)door.wanted=false;
      if(near&&out<threshold)door.armed=true;
      // Keep an occupied doorway open, including after a focus interruption.
      if(lateral<spec.width/2+radius&&Math.abs(out)<radius+.16)door.wanted=true;
      const progress=reducedMotion?Number(door.wanted):Math.max(0,Math.min(1,door.progress+(door.wanted?1/.55:-1/.65)*Math.max(0,Math.min(.05,dt||0))));
      if(progress!==door.progress){door.progress=progress;door.open=progress*progress*(3-2*progress);place(door);}
    }
  }
  function crossed(before,player) {
    if(disposed||departed)return null;
    for(const door of doors) {
      const {spec}=door,a=spec.direction*(before.z-spec.z),b=spec.direction*(player.z-spec.z);
      if(!door.armed||a>=threshold||b<threshold||b<=a)continue;
      const x=before.x+(player.x-before.x)*(threshold-a)/(b-a);
      if(Math.abs(x-spec.x)>spec.width/2-radius-.01)continue;
      if(door.colliders.some(c=>x+radius>c.x0&&x-radius<c.x1))continue;
      departed=true;return spec.id;
    }
    return null;
  }
  function cancel(){doors.forEach(door=>{door.armed=false;});}
  return {colliders,update,crossed,cancel,dispose(){disposed=true;cancel();},
    snapshot(){return doors.map(({spec,progress,open,armed})=>({id:spec.id,progress,open,armed}));}};
}
