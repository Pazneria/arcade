const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=file=>{
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(file==='assets/arcade-scene.js')for(const dependency of ['arcade-art.js','arcade-exits.js'])source=source.replace("'./"+dependency+"'",JSON.stringify(moduleUrl(fs.readFileSync(path.join(root,'assets',dependency),'utf8'))));
  return import(moduleUrl(source));
};

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
  const {createArcadeScene}=await load('assets/arcade-scene.js');
  const world=createArcadeScene(fakeThree,fakeRenderer,games);
  assert.equal(world.camera.fov,70);assert.equal(world.camera.near,.03);assert.equal(world.camera.far,40);
  assert.equal(world.anchors.length,8,'Six catalog anchors and two Home doors');
  assert.deepEqual(world.anchors.filter(a=>a.kind==='game').map(a=>a.gameIndex),[0,1,2,3,4,5]);
  for(const anchor of world.anchors.filter(a=>a.kind==='game')) {
    assert(anchor.screen,'Every actual cabinet supplies its screen surface');
    assert(anchor.interactionBounds?.isBox3&&!anchor.interactionBounds.isEmpty(),'Every cabinet retains its complete interaction envelope before static merge');
    assert(anchor.screen.corners.every(point=>anchor.interactionBounds.containsPoint(point)),'The complete physical screen belongs to its cabinet envelope');
    assert(Math.abs(anchor.screen.corners[0].distanceTo(anchor.screen.corners[1])-anchor.screen.width)<1e-8);
    assert(Math.abs(anchor.screen.normal.dot(anchor.screen.up))<1e-8,'Screen normal and up follow the tilted frame');
    const player={x:anchor.approach.x,z:anchor.approach.z,yaw:0,eye:1.62};
    const before={...player};movePlayer(player,{forward:0,strafe:0,run:false},0,world.colliders);
    assert(Math.hypot(player.x-before.x,player.z-before.z)<0.001,`Inspection anchor ${anchor.gameIndex} must stand outside colliders`);
  }
  const controllerSource=fs.readFileSync(path.join(root,'assets/arcade-controller.js'),'utf8').replace("'./arcade-motion.js'",JSON.stringify(moduleUrl(fs.readFileSync(path.join(root,'assets/arcade-motion.js'),'utf8'))));
  const {createArcadeController}=await import(moduleUrl(controllerSource)),{harness}=require('./test-arcade-controller');
  const {screenProjection}=await load('assets/arcade-screen-projection.js');
  const {sampleTokenPose}=await load('assets/token-entry/entry-session.js');
  const canvasDocument=global.document;
  for(const [width,height] of [[1280,720],[390,844],[800,390]]) {
    let layout;const h=harness(THREE,createArcadeController,null,{onScreenLayout:rect=>{layout=rect;}});
    global.innerWidth=width;global.innerHeight=height;h.canvas.getBoundingClientRect=()=>({left:0,top:0,width,height});
    Object.assign(h.world,{scene:world.scene,camera:world.camera,anchors:world.anchors,colliders:world.colliders,animate:world.animate});
    const controller=h.create(),aisle={...controller.player};
    for(const anchor of world.anchors.filter(a=>a.kind==='game')) {
      controller.focusGame(anchor.gameIndex,{approach:true});
      assert.equal(controller.player.eye,1.62);assert.equal(controller.player.x,anchor.approach.x);assert.equal(controller.player.z,anchor.approach.z);
      assert.deepEqual(world.camera.position.toArray(),[controller.player.x,1.62,controller.player.z],'Camera stays at the standing player, including short/mobile viewports');assert.equal(world.camera.fov,70);
      assert.equal(h.frames.size,0);assert(layout?.quad);const map=screenProjection(layout.quad,800,800/layout.aspect);assert(map,'Physical screen is a valid projective plane');
      for(const [u,v] of [[0,0],[1,0],[0,1],[1,1],[.18,.78],[.75,.32]]){
        const point=map.point(u,v),mapped=map.uv(point.x,point.y);
        if(u>0&&u<1&&v>0&&v<1){assert(mapped);assert(Math.abs(mapped.u-u)<1e-8&&Math.abs(mapped.v-v)<1e-8);}
        const expected=anchor.screen.corners[0].clone().lerp(anchor.screen.corners[1],u).add(anchor.screen.corners[2].clone().sub(anchor.screen.corners[0]).multiplyScalar(v)).project(world.camera);
        assert(Math.abs(point.x-(expected.x+1)*width/2)<1e-7&&Math.abs(point.y-(1-expected.y)*height/2)<1e-7,'Pointer projection agrees with the actual world screen point');
      }
      assert(anchor.tokenMount?.parent,'Insertion attaches to an existing coin-door frame');
      for(const seconds of [0,.15,.45,.7]){
        const pose=sampleTokenPose(seconds),point=new THREE.Vector3().fromArray(pose.position).add(new THREE.Vector3().fromArray(anchor.tokenMount.position)).applyMatrix4(anchor.tokenMount.parent.matrixWorld).project(world.camera);
        assert(point.x>-1&&point.x<1&&point.y>-1&&point.y<1,`Token center stays in the standing view for cabinet ${anchor.gameIndex}`);
      }
    }
    controller.returnToAisle();assert.deepEqual(controller.player,aisle);assert.equal(layout,null);controller.dispose();assert.equal(h.listenerCount,0);
  }
  global.document=canvasDocument;
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
