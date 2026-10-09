// CPU-only art/clearance audit. Canvas is a drawing recorder; no GPU or server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const base='0c771736020c8e21135b3342b4f67be6741b038d';
const beforeArtCommit='42edac87da91fd38d9b755934d3d13055b4c0ac5';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function canvas() {
  const cv={width:1,height:1,labels:[]},gradient={addColorStop(){}};
  const context=new Proxy({canvas:cv,drawImage(...args){cv.crop=args;},fillText(text){assert.equal(typeof text,'string');cv.labels.push(text);},strokeText(){},measureText(text){return {width:String(text).length*parseFloat(this.font.match(/[\d.]+px/)?.[0]||'20')*.70};},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)};},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;}},{get(o,k){return k in o?o[k]:(()=>{});}});
  cv.getContext=()=>context;return cv;
}
function stats(THREE,world) {
  const geometries=new Set(),materials=new Set();let meshes=0,triangles=0,lights=0,geometryBytes=0;
  world.scene.traverse(o=>{if(o.isLight)lights++;if(!o.isMesh)return;geometries.add(o.geometry);if(o.material.visible===false)return;meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
  for(const geo of geometries){for(const a of Object.values(geo.attributes))geometryBytes+=a.array.byteLength;geometryBytes+=geo.index?.array.byteLength||0;}
  let rgbaBaseBytes=0,rgbaWithMipBytes=0;
  for(const t of world.textures) {
    let w=t.image.width,h=t.image.height;rgbaBaseBytes+=w*h*4;
    while(true){rgbaWithMipBytes+=w*h*4;if(!t.generateMipmaps||(w===1&&h===1))break;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}
  }
  return {visibleMeshes:meshes,triangles,materials:materials.size,staticMergeBuckets:world.calls,proceduralTextures:world.textures.length,rgbaBaseBytes,rgbaWithMipBytes,retainedRenderGeometryBytes:geometryBytes,lights,colliders:world.colliders.length};
}
function solidBounds(THREE,group) {
  const bounds=new THREE.Box3();group.updateMatrixWorld(true);
  group.traverse(o=>{if(o.isMesh&&!o.material.transparent)bounds.union(new THREE.Box3().setFromObject(o));});
  return {min:bounds.min.toArray(),max:bounds.max.toArray()};
}
async function audit() {
  const THREE=await import(url(read('assets/vendor/three.module.js')));
  const {movePlayer}=await import(url(read('assets/arcade-motion.js')));
  global.document={createElement:canvas};
  const renderer={capabilities:{getMaxAnisotropy:()=>4}};
  const fakeThree={...THREE,PMREMGenerator:class{fromScene(){return {texture:new THREE.Texture(),dispose(){}};}dispose(){}}};
  const {catalog}=await require('./load-arcade-modules')();
  const games=catalog.buildArcadeCatalog(new URL('https://pazneria.github.io/arcade/'),require('../codex-link-contract'));
  const {CABINET_LAYOUT}=await import(url(read('assets/arcade-art.js')));
  const manifest=JSON.parse(read('assets/arcade-art-manifest.json'));
  const refresh=process.argv.includes('--refresh-manifest');
  for(const file of manifest.moduleFiles) {
    const bytes=Buffer.from(read(file.path).replace(/\r\n/g,'\n'));
    if(!refresh||file.path==='assets/arcade-art.js') {
      assert.equal(bytes.length,file.bytes,`${file.path} canonical source bytes changed`);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,`${file.path} source hash changed; refresh the art manifest`);
    }
  }
  // Normal npm test remains usable from a shallow checkout. --compare-base
  // remeasures the pinned ancestor when full history is available.
  const compareBase=process.argv.includes('--compare-base');
  const snapshots=[];let bounds;
  for(const revision of compareBase?['base','beforeArt','art']:refresh?['beforeArt','art']:['art']) {
    let source=revision==='art'?read('assets/arcade-scene.js'):cp.execFileSync('git',['show',(revision==='base'?base:beforeArtCommit)+':assets/arcade-scene.js'],{cwd:root,encoding:'utf8'});
    for(const dependency of ['arcade-art.js','arcade-exits.js'])source=source.replace("'./"+dependency+"'",JSON.stringify(url(read('assets/'+dependency))));
    if(revision==='art') {
      global.__arcadeArtBeforeMerge=staticRoot=>{
        bounds={bench:solidBounds(THREE,staticRoot.getObjectByName('crafted-entrance-bench')),plant:solidBounds(THREE,staticRoot.getObjectByName('crafted-entrance-plant'))};
        const decals=[];
        staticRoot.traverse(o=>{if(o.name!=='readable-cabinet-side')return;decals.push(o);
          assert.equal(o.rotation.y,Math.PI/2);assert.equal(o.material.map.image.width,512);assert.equal(o.material.map.image.height,128);
          const uv=o.geometry.attributes.uv,pos=o.geometry.attributes.position;
          for(let i=0;i<pos.count;i++)assert(Math.abs(uv.getX(i)-(pos.getX(i)/o.userData.signature.width+.5))<1e-6,'Letters increase along the +x face viewing-right axis');
          const panel=o.parent.children.find(p=>p.isMesh&&Array.isArray(p.material)&&p.position.x>0);
          assert(panel,'Decal has an actual positive cap');const normal=panel.geometry.attributes.normal,vertices=panel.geometry.attributes.position;
          let capX=-Infinity;for(let i=0;i<normal.count;i++)if(normal.getX(i)>.999)capX=Math.max(capX,vertices.getX(i)+panel.position.x);
          assert(Math.abs(o.position.x-capX-.003)<1e-5,'Signature lies outside its actual cap, without z fighting');
          const [source,x,y,w,h]=o.material.map.image.crop;
          assert(x>=0&&y>=0&&x+w<=source.width&&y+h<=source.height,'Crop stays inside the authored side canvas');
          assert.equal(o.userData.signature.title.replaceAll(' ',''),source.labels.join('').replaceAll(' ',''));
          o.parent.updateMatrixWorld(true);
          for(let i=0;i<pos.count;i++){
            const origin=new THREE.Vector3(o.position.x+1,o.position.y+pos.getY(i)*.99999,o.position.z-pos.getX(i)*.99999).applyMatrix4(o.parent.matrixWorld);
            const direction=new THREE.Vector3(-1,0,0).transformDirection(o.parent.matrixWorld);
            assert(new THREE.Raycaster(origin,direction).intersectObject(panel,false).length,'Every decal corner stays within the actual curved cap');
          }
        });
        assert.equal(decals.length,6,'All cabinet positive faces have readable physical shoulder lettering');
      };
      source=source.replace('const calls = mergeStatic(staticRoot);','globalThis.__arcadeArtBeforeMerge?.(staticRoot);const calls = mergeStatic(staticRoot);');
    }
    const {createArcadeScene}=await import(url(source));
    const world=createArcadeScene(fakeThree,renderer,games);
    const snapshot={revision,stats:stats(THREE,world)};
    if(revision==='art') {
      snapshot.bounds=bounds;
      // Exclude soft contact-shadow planes; solid props must fit old colliders.
      for(const [name,limits] of [['bench',[-3.25,-.55,-1.85,0]],['plant',[-3.6,-1.15,-3.1,-.75]]]) {
        const b=bounds[name];assert(b.min[0]>=limits[0]-1e-5&&b.min[2]>=limits[1]-1e-5&&b.max[0]<=limits[2]+1e-5&&b.max[2]<=limits[3]+1e-5,`${name} extends outside its existing collision footprint: ${JSON.stringify(b)}`);
      }
      assert.equal(world.anchors.filter(a=>a.kind==='game').length,6);
      const expected=[CABINET_LAYOUT.left[0],CABINET_LAYOUT.left[1],CABINET_LAYOUT.right[0],CABINET_LAYOUT.right[1],CABINET_LAYOUT.left[2],CABINET_LAYOUT.feature];
      world.anchors.filter(a=>a.kind==='game').forEach(a=>assert(Math.abs(a.approach.z-expected[a.gameIndex]-(a.gameIndex===5?1.55:0))<1e-6));
      // The full centre aisle and lateral approaches remain walkable with the
      // production radius. Spaced left cabinets also admit a player between.
      const walk=(start,end)=>{
        const player={...start,eye:1.62,crouch:false,yaw:0};
        const dx=end.x-start.x,dz=end.z-start.z,length=Math.hypot(dx,dz);
        if(length<1e-8)return;
        movePlayer(player,{forward:-dz/length,strafe:dx/length,run:false},length/1.9,world.colliders);
        assert(Math.hypot(player.x-end.x,player.z-end.z)<1e-5,`Walk blocked: ${JSON.stringify({start,end,player})}`);
      };
      walk({x:0,z:-.95},{x:0,z:-7.5});
      for(const a of world.anchors.filter(a=>a.kind==='game'))walk({x:0,z:a.approach.z},{x:a.approach.x,z:a.approach.z});
      for(let i=0;i<2;i++){const z=(CABINET_LAYOUT.left[i]+CABINET_LAYOUT.left[i+1])/2;walk({x:0,z},{x:-3.25,z});}
      snapshot.marquees=world.textures.filter(t=>t.image.height===256&&t.image.labels?.some(l=>l.includes('AMUSEMENTS')||l==='STARLITE ORIGINAL / 2-PLAYER DELUXE')).map(t=>({width:t.image.width,height:t.image.height,text:t.image.labels}));
      assert.equal(snapshot.marquees.length,6,'One integrated marquee per game');
      const names=snapshot.marquees.map(m=>m.text.filter(l=>!l.includes('AMUSEMENTS')&&!l.startsWith('STARLITE ORIGINAL')).join(' ')).sort();
      assert.deepEqual(names,games.map(g=>g.name.toUpperCase()).sort());
      assert(!world.textures.some(t=>t.image.labels?.includes('PLAY / GUIDE')),'Duplicate floating launch-card texture must be absent');
    }
    snapshots.push(snapshot);world.dispose();
  }
  delete global.__arcadeArtBeforeMerge;
  const baseline=snapshots.find(s=>s.revision==='base')||{stats:manifest.baseline};
  const art=snapshots.find(s=>s.revision==='art');
  if(compareBase)assert.deepEqual(baseline.stats,manifest.baseline,'Recorded baseline must match the pinned ancestor');
  const beforeArt=snapshots.find(s=>s.revision==='beforeArt');
  if(refresh) {
    manifest.isolatedArtReceipt='docs/cabinet-art-isolated-receipt.json';
    manifest.moduleFiles=manifest.moduleFiles.map(file=>{const bytes=Buffer.from(read(file.path).replace(/\r\n/g,'\n'));return {...file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
    manifest.art=art.stats;
    manifest.delta=Object.fromEntries(Object.keys(art.stats).map(k=>[k,art.stats[k]-baseline.stats[k]]));
    manifest.integration={beforeArtCommit,beforeArt:beforeArt.stats,deltaFromBeforeArt:Object.fromEntries(Object.keys(art.stats).map(k=>[k,art.stats[k]-beforeArt.stats[k]])),
      sourcePatchSha256:'6e1d7361b94256e97d20f2e9d0e5854874d3973fd6a004f793210e091e283fad',sourceBundleSha256:'f8934d5d2a5a04c967d57813aabc48e39b6f5a8011e73b9561c0df9276a0d8a7'};
    fs.writeFileSync(path.join(root,'assets/arcade-art-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  if(beforeArt)assert.deepEqual(beforeArt.stats,manifest.integration.beforeArt,'Recorded pre-art integration must match the cabinet-screen head');
  assert.deepEqual(art.stats,manifest.art,'Asset cost manifest must match constructed art');
  // Report the resource tradeoff; do not turn this scene snapshot into a
  // quality cap that would force reductions when the door work is integrated.
  const report={baseCommit:base,evidence:'CPU scene construction and drawing recorders. No browser/server/WebGL/GPU. RGBA accounting excludes the unchanged PMREM target and driver overhead; mesh submissions are structural, not measured frame calls.',baseline:baseline.stats,art:art.stats,delta:Object.fromEntries(Object.keys(art.stats).map(k=>[k,art.stats[k]-baseline.stats[k]])),integration:manifest.integration,bounds,marquees:art.marquees,layout:CABINET_LAYOUT};
  if(process.env.ARCADE_ART_RECEIPT)fs.writeFileSync(process.env.ARCADE_ART_RECEIPT,JSON.stringify(report,null,2)+'\n');
  return report;
}
if(require.main===module)audit().then(r=>console.log('Arcade CPU art, existing prop footprint and walkable clearance checks passed. '+JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={audit};
