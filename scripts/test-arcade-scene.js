const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=file=>import(moduleUrl(fs.readFileSync(path.join(root,file),'utf8')));

// Canvas drawing is stubbed solely to build and inspect geometry on the CPU.
// This never creates a browser, WebGL context, renderer, or GPU measurement.
function canvas() {
  const cv={width:1,height:1};
  const gradient={addColorStop(){}};
  const ctx=new Proxy({canvas:cv,fillText(text){assert.notEqual(text,undefined,'Texture labels must never render undefined');},strokeText(text){assert.notEqual(text,undefined,'Texture labels must never render undefined');},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},measureText(text){return {width:String(text).length*20};},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;}},{get(obj,key){return key in obj?obj[key]:(()=>{});}});
  cv.getContext=()=>ctx;return cv;
}
(async()=>{
  const {createPlayer,movePlayer,pixelRatio,canInteract}=await load('assets/arcade-motion.js');
  assert.deepEqual(createPlayer(),{x:0,z:-0.95,yaw:0,pitch:-0.04,eye:1.62,crouch:false},'Handoff default-entry-v1 pose remains pinned');
  const straight=createPlayer(),diagonal=createPlayer();
  movePlayer(straight,{forward:1,strafe:0,run:false},1,[]);movePlayer(diagonal,{forward:1,strafe:1,run:false},1,[]);
  assert(Math.abs(Math.hypot(diagonal.x,diagonal.z+0.95)-Math.hypot(straight.x,straight.z+0.95))<1e-8,'Diagonal movement must not be faster');
  const p=createPlayer();movePlayer(p,{forward:1,strafe:0,run:true},1,[{x0:-2,x1:2,z0:-2,z1:-1.99}]);assert(p.z>=-1.72-1e-6,'Swept movement cannot pass a thin wall');
  const stopped={...p};movePlayer(p,{forward:0,strafe:0,run:false},0.1,[]);assert.equal(p.x,stopped.x);assert.equal(p.z,stopped.z);
  assert.equal(canInteract(2,1),false);assert.equal(canInteract(2,1.9),true);assert.equal(canInteract(4),false);
  assert(pixelRatio(3840,2160,2,false)**2*3840*2160<=2304000+1);
  assert(pixelRatio(390,844,3,true)<=1.25);
  const THREE=await load('assets/vendor/three.module.js');
  global.document={createElement:canvas};
  const fakeRenderer={capabilities:{getMaxAnisotropy:()=>4}};
  let environmentDisposed=false;
  const fakeThree={...THREE,PMREMGenerator:class{fromScene(){return {texture:new THREE.Texture(),dispose(){environmentDisposed=true;}};}dispose(){}}};
  const {catalog}=await require('./load-arcade-modules')();
  const games=catalog.buildArcadeCatalog(new URL('https://pazneria.github.io/arcade/'),require('../codex-link-contract'));
  const sceneSource=fs.readFileSync(path.join(root,'assets/arcade-scene.js'),'utf8').replace("'./arcade-exits.js'",JSON.stringify(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-exits.js'),'utf8'))));
  const {createArcadeScene}=await import(moduleUrl(sceneSource));
  const world=createArcadeScene(fakeThree,fakeRenderer,games);
  assert.equal(world.camera.fov,70);assert.equal(world.camera.near,.03);assert.equal(world.camera.far,40);
  assert.equal(world.anchors.length,8,'Six catalog anchors and two Home doors');
  assert.deepEqual(world.anchors.filter(a=>a.kind==='game').map(a=>a.gameIndex),[0,1,2,3,4,5]);
  for(const anchor of world.anchors.filter(a=>a.kind==='game')) {
    const player={x:anchor.approach.x,z:anchor.approach.z,yaw:0,eye:1.62};
    const before={...player};movePlayer(player,{forward:0,strafe:0,run:false},0,world.colliders);
    assert(Math.hypot(player.x-before.x,player.z-before.z)<0.001,`Inspection anchor ${anchor.gameIndex} must stand outside colliders`);
  }
  world.scene.updateMatrixWorld(true);
  for(const anchor of world.anchors) {
    const at=anchor.approach || new THREE.Vector3(anchor.position.x,0,anchor.id==='home-exit'?-9:-0.95);
    world.camera.position.set(at.x,1.62,at.z);world.camera.lookAt(anchor.position);world.camera.updateMatrixWorld();
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),world.camera);
    const hit=ray.intersectObjects(world.targetMeshes,false)[0];
    const blocker=ray.intersectObjects(world.scene.children,true).find(i=>!i.object.userData.anchor && i.object.material && !i.object.material.transparent && i.object.material.visible!==false);
    assert.equal(hit?.object.userData.anchor,anchor,`Closest ray target must be ${anchor.id}`);
    assert(canInteract(hit.distance,blocker?.distance),`Target ${anchor.id} must be usable from its approach`);
  }
  world.camera.position.set(0,1.62,-0.95);world.animate(1,0.016);
  for(const [id,x,z,yaw] of [['home-entrance',0,-.95,Math.PI],['home-exit',-2.75,-10,0]]) {
    const exitWorld=createArcadeScene(fakeThree,fakeRenderer,games);
    const walking={x,z,yaw,eye:1.62,crouch:false};let crossing=null;
    for(let step=0;step<50&&!crossing;step++) {
      exitWorld.exits.update(walking,.05);const before={...walking};
      movePlayer(walking,{forward:1,strafe:0,run:true},.05,exitWorld.colliders);
      crossing=exitWorld.exits.crossed(before,walking);
    }
    assert.equal(crossing,id,`${id} must have a passable shell opening after sliding`);
    exitWorld.scene.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(x,1.3,z),new THREE.Vector3(0,0,id==='home-entrance'?1:-1),0,1.5);
    assert(!ray.intersectObjects(exitWorld.scene.children,true).some(i=>!i.object.userData.anchor&&!i.object.material.transparent&&i.object.material.visible!==false),`${id} has no solid geometry across the open doorway`);
    exitWorld.dispose();
  }
  const stats={meshes:0,vertices:0,triangles:0,materials:new Set(),textures:world.textures.length,staticMergeBuckets:world.calls,colliders:world.colliders.length};
  world.scene.traverse(o=>{if(!o.isMesh||o.material.visible===false)return;stats.meshes++;stats.vertices+=o.geometry.attributes.position.count;stats.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;stats.materials.add(o.material);});
  const materialCount=stats.materials.size;delete stats.materials;
  assert(stats.meshes<240,'Static scene should remain merged, not thousands of individual draws');
  assert(stats.staticMergeBuckets>0);
  const source=JSON.parse(fs.readFileSync(path.join(root,'assets/arcade-source.json')));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/vendor/three.module.js'))).digest('hex'),source.files['frozen/vendor/three.module.js'].sha256);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/vendor/THREE-LICENSE.txt'))).digest('hex'),source.files['frozen/vendor/THREE-LICENSE.txt'].sha256);
  world.dispose();assert(environmentDisposed,'Environment render target must be disposed');assert.equal(world.scene.children.length,0);
  console.log('Arcade CPU scene/motion checks passed. Structural counts only: '+JSON.stringify({...stats,materialCount}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
