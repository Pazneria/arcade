const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const source=name=>fs.readFileSync(path.join(root,'assets/token-entry',name),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
let checks=0;
function check(name,fn){return Promise.resolve().then(fn).then(()=>{checks++;console.log('PASS '+name);});}
(async()=>{
  const sessionUrl=url(source('entry-session.js')),propUrl=url(source('token-prop.js'));
  const {createEntrySession,sampleTokenPose,TOKEN_DURATION,REDUCED_DURATION}=await import(sessionUrl);
  const {createTokenProp}=await import(propUrl);
  const {createTokenEntry}=await import(url(source('token-entry.js').replace("'./entry-session.js'",JSON.stringify(sessionUrl)).replace("'./token-prop.js'",JSON.stringify(propUrl))));
  const THREE=await import(url(fs.readFileSync(path.join(root,'assets/vendor/three.module.js'),'utf8')));
  await check('ready first still completes exactly once after insertion',async()=>{
    const events=[],s=createEntrySession({onInsert:e=>events.push(['insert',e.ready]),onComplete:e=>events.push(['complete',e.value])});
    let calls=0;const p=s.start({preload:()=>{calls++;return Promise.resolve('engine-ready');}});
    await flush();assert.equal(s.state.ready,true);assert.equal(s.state.phase,'inserting');
    assert.equal(s.start({preload:()=>{calls++;throw Error('duplicate');}}),p);assert.equal(calls,1);
    s.update(TOKEN_DURATION-.001);assert.equal(s.state.phase,'inserting');s.update(.0011);
    assert.equal(await p,'engine-ready');s.update(100);assert.deepEqual(events,[['insert',true],['complete','engine-ready']]);
  });
  await check('insertion first has static waiting state and no fake readiness',async()=>{
    const d=defer(),s=createEntrySession();const p=s.start({preload:d.promise});s.update(10);
    assert.equal(s.state.phase,'waiting');assert.equal(s.state.ready,false);assert.equal(s.update(100),false);
    d.resolve('real-ready');assert.equal(await p,'real-ready');assert.equal(s.state.phase,'complete');
  });
  await check('external cancellation aborts work and old success cannot complete retry',async()=>{
    const old=defer(),next=defer(),signal=new AbortController();let workSignal,completions=0,cancels=0;
    const s=createEntrySession({onComplete:()=>completions++,onCancel:()=>cancels++});
    const p=s.start({signal:signal.signal,preload:({signal})=>{workSignal=signal;return old.promise;}});
    const rejection=assert.rejects(p,{name:'AbortError'});signal.abort('Back');await rejection;
    assert.equal(workSignal.aborted,true);assert.equal(cancels,1);
    const retry=s.start({preload:next.promise});old.resolve('stale');await flush();assert.equal(s.state.ready,false);
    s.update(1);next.resolve('retry-ready');assert.equal(await retry,'retry-ready');assert.equal(completions,1);
  });
  await check('old failure is isolated from a new session',async()=>{
    const d=defer(),s=createEntrySession();const p=s.start({preload:d.promise});const cancelled=assert.rejects(p,{name:'AbortError'});
    s.cancel();await cancelled;const retry=s.start({preload:Promise.resolve('ok')});d.reject(Error('late'));await flush();s.update(1);assert.equal(await retry,'ok');
  });
  await check('errors and thrown preload support retry without stranded work',async()=>{
    let errors=0;const s=createEntrySession({onError:()=>errors++});
    await assert.rejects(s.start({preload:()=>{throw Error('loader failed');}}),/loader failed/);
    assert.equal(s.state.phase,'error');await assert.rejects(s.start({preload:Promise.reject(Error('network failed'))}),/network failed/);
    await assert.rejects(s.start({preload:()=>undefined}),/readiness Promise/);assert.equal(errors,3);
    const p=s.start({preload:Promise.resolve(42)});s.update(1);assert.equal(await p,42);
  });
  await check('pre-aborted requests do not start work; listeners detach after settlement',async()=>{
    const aborted=new AbortController();aborted.abort();let calls=0;const s=createEntrySession();
    await assert.rejects(s.start({signal:aborted.signal,preload:()=>calls++}),{name:'AbortError'});assert.equal(calls,0);
    const ctrl=new AbortController();let adds=0,removes=0;
    const signal={get aborted(){return ctrl.signal.aborted;},get reason(){return ctrl.signal.reason;},
      addEventListener(...a){adds++;ctrl.signal.addEventListener(...a);},removeEventListener(...a){removes++;ctrl.signal.removeEventListener(...a);}};
    const p=s.start({signal,preload:Promise.resolve()});s.update(1);await p;ctrl.abort();assert.equal(s.state.phase,'complete');assert.equal(adds,1);assert.equal(removes,1);
  });
  await check('reduced motion is stationary and uses the same readiness barrier',async()=>{
    const s=createEntrySession({reducedMotion:()=>true}),d=defer();const p=s.start({preload:d.promise});
    const a=sampleTokenPose(0,{reducedMotion:true,duration:REDUCED_DURATION}),b=sampleTokenPose(.05,{reducedMotion:true,duration:REDUCED_DURATION});
    assert.deepEqual(a.position,b.position);assert.deepEqual(a.rotation,b.rotation);
    s.update(REDUCED_DURATION);assert.equal(s.state.phase,'waiting');d.resolve('ok');assert.equal(await p,'ok');
  });
  await check('host hook failures cannot strand completion and onStart can cancel',async()=>{
    let failures=0;const s=createEntrySession({onStart:()=>{throw Error('hook');},onComplete:()=>{throw Error('hook');},onHookError:()=>failures++});
    const p=s.start({preload:Promise.resolve()});s.update(1);await p;assert.equal(failures,2);
    let invoked=false;const reentrant=createEntrySession({onStart:()=>reentrant.cancel('host changed cabinet')});
    await assert.rejects(reentrant.start({preload:()=>{invoked=true;return Promise.resolve();}}),{name:'AbortError'});assert.equal(invoked,false);
  });
  await check('state hooks may cancel before start without resurrecting the prop',async()=>{
    const parent=new THREE.Group();let starts=0,entry;
    entry=createTokenEntry({THREE,parent,document:null,onState:event=>{if(event.phase==='inserting')entry.cancel('selection changed');},onStart:()=>starts++});
    await assert.rejects(entry.start({preload:Promise.resolve()}),{name:'AbortError'});
    assert.equal(starts,0);assert.equal(entry.root.visible,false);entry.dispose();
  });
  await check('timestep partitions, contact alignment and final occlusion are deterministic',async()=>{
    const a=createEntrySession(),b=createEntrySession();const pa=a.start({preload:Promise.resolve()}),pb=b.start({preload:Promise.resolve()});
    for(let i=0;i<92;i++)a.update(.01);b.update(.92+1e-12);a.update(1e-12);await Promise.all([pa,pb]);
    const radius=.052,contact=sampleTokenPose(TOKEN_DURATION*.63,{radius});
    assert(Math.abs(contact.position[0])<1e-12&&Math.abs(contact.position[1])<1e-12);assert.equal(contact.rotation[1],Math.PI/2);
    assert(sampleTokenPose(TOKEN_DURATION,{radius}).position[2]<-radius);
    let last=Infinity;for(let i=63;i<=100;i++){const pose=sampleTokenPose(TOKEN_DURATION*i/100,{radius});assert.equal(pose.position[0],0);assert.equal(pose.position[1],0);assert(pose.position[2]<=last);last=pose.position[2];}
  });
  await check('all real Three geometry is finite, reeded edge is instanced, mount follows parent',async()=>{
    const parent=new THREE.Group();parent.position.set(2,.3,-4);parent.rotation.y=.8;
    const prop=createTokenProp({THREE,parent,mount:{position:[.065,.55,.512],rotation:[0,.12,0],scale:1.1},document:null});
    assert.equal(prop.root.parent,parent);assert.equal(prop.root.visible,false);assert.equal(prop.summary.reedCount,88);
    for(const geometry of prop.resources.geometries){for(const number of geometry.attributes.position.array)assert(Number.isFinite(number));geometry.computeBoundingBox();assert(!geometry.boundingBox.isEmpty());}
    const reeds=prop.token.getObjectByName('milled-edge-88-reeds');assert.equal(reeds.count,88);
    prop.pose(sampleTokenPose(.4));parent.updateMatrixWorld(true);assert(prop.token.getWorldPosition(new THREE.Vector3()).length()>1);
    assert(prop.summary.mouthWidth>prop.summary.thickness);assert(prop.summary.mouthHeight>prop.summary.radius*2);prop.dispose();assert.equal(parent.children.length,0);
  });
  await check('mouth shader clips only owned materials and supports instanced world transforms',async()=>{
    const parent=new THREE.Group(),prop=createTokenProp({THREE,parent,document:null});
    const material=prop.token.children.find(x=>x.material).material;
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);assert(shader.uniforms.tokenMouthPlane);assert(shader.vertexShader.includes('instanceMatrix * tokenWorldPosition'));
    assert(shader.fragmentShader.includes('tokenMouthPlane) < 0.0) discard'));assert(!prop.slot.children[0].material.customProgramCacheKey().includes('arcade-token-mouth'));prop.dispose();
  });
  await check('idle costs no pose/matrix updates; disposal frees every owned resource once',async()=>{
    const parent=new THREE.Group(),entry=createTokenEntry({THREE,parent,document:null});let matrices=0;
    const original=entry.root.updateWorldMatrix;entry.root.updateWorldMatrix=function(...a){matrices++;return original.apply(this,a);};
    for(let i=0;i<5000;i++)assert.equal(entry.update(.016),false);assert.equal(matrices,0);assert.equal(entry.root.visible,false);
    let events=0;const resources=new Set();entry.root.traverse(object=>{if(object.geometry)resources.add(object.geometry);if(object.material)resources.add(object.material);if(object.isInstancedMesh)resources.add(object);});
    for(const resource of resources)resource.addEventListener('dispose',()=>events++);
    const d=defer(),p=entry.start({preload:d.promise}),rejected=assert.rejects(p,{name:'AbortError'});entry.update(.2);assert(entry.token.visible);
    entry.dispose();await rejected;entry.dispose();assert.equal(events,resources.size);assert.equal(parent.children.length,0);assert.equal(entry.state.phase,'disposed');
    await assert.rejects(entry.start({preload:Promise.resolve()}),/disposed/);d.resolve();await flush();assert.equal(entry.update(1),false);
  });
  await check('borrowed environment textures survive reset and disposal',()=>{
    const parent=new THREE.Group(),env=new THREE.Texture();let freed=0;env.addEventListener('dispose',()=>freed++);
    const entry=createTokenEntry({THREE,parent,document:null,envMap:env});entry.reset();entry.dispose();assert.equal(freed,0);env.dispose();assert.equal(freed,1);
  });
  await check('no private render loop, timers, loaders or host camera edits',()=>{
    const all=source('entry-session.js')+source('token-entry.js')+source('token-prop.js');
    assert(!/requestAnimationFrame\s*\(|setTimeout\s*\(|setInterval\s*\(|new\s+THREE\.(?:TextureLoader|WebGLRenderer)|camera\.(?:position|fov|zoom)/.test(all));
  });
  console.log(JSON.stringify({checks,threeRevision:THREE.REVISION,tokenDuration:TOKEN_DURATION,reducedDuration:REDUCED_DURATION,graphics:false}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
