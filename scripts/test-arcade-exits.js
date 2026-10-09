const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=name=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'assets',name),'utf8')).toString('base64'));
(async()=>{
  const {createSlidingExits,EXIT_DOORS}=await load('arcade-exits.js');
  const {movePlayer}=await load('arcade-motion.js');
  for(const spec of EXIT_DOORS) {
    const changes=[],exits=createSlidingExits((s,open)=>changes.push([s.id,open]));
    const player={x:spec.x,z:spec.z-spec.direction*.8,yaw:spec.direction===1?Math.PI:0,eye:1.62,crouch:false};
    const closed={...player};movePlayer(closed,{forward:1,strafe:0,run:true},.5,exits.colliders);
    assert(spec.direction*(closed.z-spec.z)<0,'Closed panel collision blocks outward movement');
    const initial=exits.snapshot();exits.update(player,1,{active:false});exits.update(player,1,{focused:false});assert.deepEqual(exits.snapshot(),initial);
    for(let i=0;i<12;i++)exits.update(player,.05);
    assert.equal(exits.snapshot().find(d=>d.id===spec.id).open,1);
    assert.equal(exits.crossed(player,player),null,'Approach/standing never navigate');
    assert.equal(exits.crossed(player,{...player,z:spec.z-spec.direction}),null,'Retreat never navigates');
    assert.equal(exits.crossed({x:spec.x+1,z:spec.z-spec.direction*.1},{x:spec.x+1,z:spec.z+spec.direction*.3}),null,'Passing alongside does not navigate');
    let crossed=null;
    for(let i=0;i<30&&!crossed;i++) {
      exits.update(player,.05);const before={...player};movePlayer(player,{forward:1,strafe:0,run:true},.05,exits.colliders);crossed=exits.crossed(before,player);
    }
    assert.equal(crossed,spec.id,'Running through a clear opening departs once');
    assert.equal(exits.crossed({x:spec.x,z:spec.z-spec.direction},{x:spec.x,z:spec.z+spec.direction}),null);
    exits.dispose();const final=exits.snapshot();exits.update(player,.05);assert.deepEqual(exits.snapshot(),final);

    const interrupted=createSlidingExits();const near={x:spec.x,z:spec.z+spec.direction*.1};
    interrupted.update(near,.05,{reducedMotion:true});interrupted.cancel();
    assert.equal(interrupted.crossed(near,{...near,z:spec.z+spec.direction*.3}),null,'Pause invalidates a pending crossing');
    interrupted.update(near,.05,{reducedMotion:true});
    assert.equal(interrupted.crossed(near,{...near,z:spec.z+spec.direction*.3}),spec.id,'Resume at the threshold does not require backtracking');
    const outside=createSlidingExits();outside.update({x:spec.x,z:spec.z+spec.direction*.3},.05,{reducedMotion:true});
    assert.equal(outside.crossed({x:spec.x,z:spec.z+spec.direction*.3},{x:spec.x,z:spec.z+spec.direction*.4}),null,'Starting outside does not depart');
    const fast=createSlidingExits();fast.update({x:spec.x,z:spec.z-spec.direction},20);assert(fast.snapshot().find(d=>d.id===spec.id).progress<.1,'Delayed frame is capped');
    assert(changes.length<60,'Door updates change existing transforms without continuous idle work');
  }
  console.log('Arcade CPU sliding-door collision, threshold, interruption and disposal checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
