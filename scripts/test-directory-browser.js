const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');

// --check-fixtures parses served test instrumentation without a browser or server.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const names = ['RaceGPT','OSRS Clone','Sword Guys','Ghost Signal','Night Courier','Rebound Relay'];
const guidePaths = ['/racegpt/wiki/','/osrs-clone-codex/wiki/','/sword-guys/wiki/',null,null,'/rebound-relay/wiki/'];
const modes = ['no-webgl','no-webgl-mobile','renderer-failure','import-failure','normal','mobile','published'];
function replaceOnce(source, needle, replacement, label) {
  assert(source.includes(needle),`Test instrumentation no longer matches ${label}`);
  assert.equal(source.indexOf(needle),source.lastIndexOf(needle),`Ambiguous test seam: ${label}`);
  return source.replace(needle,replacement);
}
function instrumentApp(source) {
  const helpFunction=source.includes('function showHelp(')?'showHelp':'showWelcome';
  source=replaceOnce(source,'const $=id=>document.getElementById(id);',`
let __arcadeLastDisposed=null,__arcadeDisposeCalls=0;
const __arcadePageShows=[];
window.__arcadeControllersCreated=0;
window.addEventListener('pageshow',e=>__arcadePageShows.push({persisted:e.persisted}));
function __arcadeSnapshot() {
  return {mode,selected,failed,generation,hasController:!!controller,
    canvasCount:document.querySelectorAll('#scene-container canvas').length,
    created:window.__arcadeControllersCreated,disposeCalls:__arcadeDisposeCalls,
    pageShows:__arcadePageShows.slice(),controller:controller?.__test.snapshot()||null};
}
const $=id=>document.getElementById(id);`,'app DOM entry');
  source=replaceOnce(source,'controller?.dispose();controller=null;',
    'controller?.dispose();__arcadeDisposeCalls++;if(controller?.__test)__arcadeLastDisposed=controller.__test.snapshot();controller=null;',
    'app disposal');
  source=replaceOnce(source,'navigate:destination=>location.assign(destination)',`navigate:async destination=>{
    await window.__recordArcadeNavigation({destination,app:__arcadeSnapshot(),lastDisposed:__arcadeLastDisposed});
    location.assign(destination);
  }`,'dispose-before-navigation');
  return source+`
// Exposed only by this test server, never by the shipped modules.
window.arcadeTest={inspect,openDirectory,${helpFunction},startExplore,initialize,dispose,save,
  get controller(){return controller;},get state(){return __arcadeSnapshot();},
  get lastDisposed(){return __arcadeLastDisposed;}};
`;
}
function instrumentController(source) {
  source=replaceOnce(source,'  const ray=new THREE.Raycaster(),point=new THREE.Vector2(),view=new THREE.Vector3();',`
  let __renders=0,__worldDisposals=0,__rendererDisposals=0,__contextLosses=0,__blocker=null;
  window.__arcadeControllersCreated++;
  const __render=renderer.render.bind(renderer),__worldDispose=world.dispose.bind(world);
  const __rendererDispose=renderer.dispose.bind(renderer),__contextLoss=renderer.forceContextLoss.bind(renderer);
  renderer.render=(...args)=>{__renders++;return __render(...args);};
  world.dispose=()=>{__worldDisposals++;return __worldDispose();};
  renderer.dispose=()=>{__rendererDisposals++;return __rendererDispose();};
  renderer.forceContextLoss=()=>{__contextLosses++;return __contextLoss();};
  const ray=new THREE.Raycaster(),point=new THREE.Vector2(),view=new THREE.Vector3();`,'controller counters');
  return replaceOnce(source,'  return {player,pause,resume,capture,focusGame,',`
  const __test={
    snapshot(){return {disposed,active,raf,renderCount:__renders,worldDisposeCount:__worldDisposals,
      rendererDisposeCount:__rendererDisposals,contextLossCount:__contextLosses,listenerCount:listeners.length,
      connected:canvas.isConnected,keys:[...keys],touchMove,gesture:!!gesture,target:target?.id||null,
      player:{...player},renderStats:{...renderer.info.render},pixels:canvas.width*canvas.height};},
    anchors(){return anchors.map(a=>({id:a.id,kind:a.kind,gameIndex:a.gameIndex,
      position:a.position.toArray(),approach:a.approach?.toArray()}));},
    faceAnchor(id,distance=null){
      const anchor=anchors.find(a=>a.id===id);if(!anchor)throw new Error('Missing anchor '+id);
      clearInput();
      const approach=anchor.approach||new THREE.Vector3(anchor.position.x,0,
        anchor.position.z+(id==='home-entrance'?-1.05:1.05));
      let x=approach.x,z=approach.z;
      if(distance!==null){const dx=x-anchor.position.x,dz=z-anchor.position.z,len=Math.hypot(dx,dz)||1;
        x=anchor.position.x+dx/len*distance;z=anchor.position.z+dz/len*distance;}
      Object.assign(player,{x,z,eye:1.62,crouch:false});
      view.copy(anchor.position).sub(new THREE.Vector3(player.x,player.eye,player.z));
      player.yaw=Math.atan2(-view.x,-view.z);player.pitch=Math.atan2(view.y,Math.hypot(view.x,view.z));renderOnce();
    },
    point(id){const anchor=anchors.find(a=>a.id===id),p=anchor.position.clone().project(camera),rect=canvas.getBoundingClientRect();
      return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};},
    pick(x,y){return pick(x,y)?.id||null;},
    block(id){const anchor=anchors.find(a=>a.id===id);
      __blocker=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.12),new THREE.MeshBasicMaterial({color:0x000000}));
      __blocker.position.copy(camera.position).lerp(anchor.position,.5);__blocker.lookAt(camera.position);scene.add(__blocker);renderOnce();},
    unblock(){if(!__blocker)return;scene.remove(__blocker);__blocker.geometry.dispose();__blocker.material.dispose();__blocker=null;renderOnce();},
    freezeElapsed(){elapsed=0;renderOnce();},
    camera(){return {position:camera.position.toArray(),pitch:camera.rotation.x,yaw:camera.rotation.y,order:camera.rotation.order,fov:camera.fov,near:camera.near,far:camera.far,aspect:camera.aspect};},
    graphics(){const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),version:gl.getParameter(gl.VERSION),contextLost:gl.isContextLost(),programs:renderer.info.programs.map(p=>({name:p.name,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS),log:gl.getProgramInfoLog(p.program)}))};},
    loseContext(){renderer.forceContextLoss();}
  };
  return {__test,player,pause,resume,capture,focusGame,`,'controller return');
}
const appFixture=instrumentApp(read('assets/arcade-app.js'));
const controllerFixture=instrumentController(read('assets/arcade-controller.js'));
const vendorFixture=read('assets/vendor/three.module.js');
const rendererFailureFixture=replaceOnce(vendorFixture,'class WebGLRenderer {\n\n\tconstructor( parameters = {} ) {',
  "class WebGLRenderer {\n\n\tconstructor( parameters = {} ) {\n\t\tthrow new Error('Test renderer constructor failure');",'pinned renderer constructor');
function checkFixtureSyntax() {
  for(const [label,source] of [['app',appFixture],['controller',controllerFixture]]) {
    new vm.Script(source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),{filename:`test-fixture-${label}.js`});
  }
  assert(fs.existsSync(path.join(root,'assets/vendor/THREE-LICENSE.txt')));
  console.log('Browser suite and served module fixtures parsed. No server, browser, or GPU session started.');
}
function fixtureFor(relative) {
  if(relative==='assets/arcade-app.js')return Buffer.from(appFixture);
  if(relative==='assets/arcade-controller.js')return Buffer.from(controllerFixture);
  const absolute=path.resolve(root,relative);
  if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())return null;
  return fs.readFileSync(absolute);
}
function mime(relative) {
  return ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp',
    '.json':'application/json','.txt':'text/plain'})[path.extname(relative)]||'application/octet-stream';
}
const stubDestination='<!doctype html><html><body><h1>Test destination</h1><p>The real game or website was not contacted.</p></body></html>';
function createFixtureServer() {
  return http.createServer((req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(stubDestination);return;}
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(!pathname.startsWith('/arcade/')){res.writeHead(404);res.end();return;}
    const relative=pathname.slice('/arcade/'.length)||'index.html',body=fixtureFor(relative);
    if(!body){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',mime(relative));res.end(body);
  });
}
async function routeAll(context,localOrigin,mode,unexpected) {
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()),arcadeAsset=url.pathname.startsWith('/arcade/');
    if(arcadeAsset&&url.pathname.endsWith('/assets/vendor/three.module.js')) {
      if(mode==='import-failure')return route.abort('failed');
      if(mode==='renderer-failure')return route.fulfill({contentType:'application/javascript',body:rendererFailureFixture});
    }
    if(url.origin===localOrigin)return route.continue();
    if(url.origin==='https://pazneria.github.io') {
      if(arcadeAsset){const relative=decodeURIComponent(url.pathname.slice('/arcade/'.length))||'index.html',body=fixtureFor(relative);
        return body?route.fulfill({contentType:mime(relative),body}):route.fulfill({status:404,body:'Missing test fixture'});}
      return route.fulfill({contentType:'text/html',body:stubDestination});
    }
    if(['http://127.0.0.1:5178','http://localhost:5178','http://127.0.0.1:5179','http://localhost:5179'].includes(url.origin))
      return route.fulfill({contentType:'text/html',body:stubDestination});
    unexpected.push(url.href);return route.abort('blockedbyclient');
  });
}
async function assertDirectory(page,failed,published=false) {
  assert(await page.locator('#mobile-fallback').isVisible());
  assert.deepEqual(await page.locator('.fallback-card h2').allTextContents(),names);
  assert.equal(await page.locator('.fallback-card a').count(),8,'Four Play destinations and four confirmed Guides');
  for(const [index,name] of names.entries()) {
    const card=page.locator('.fallback-card').nth(index);
    if([3,4].includes(index)){assert.match(await card.innerText(),/Coming soon/);assert.equal(await card.locator('a').count(),0);continue;}
    const launch=card.getByRole('link',{name:`Launch ${name} (opens in new tab)`,exact:true});
    const guide=card.getByRole('link',{name:`Open ${name} guide (opens in new tab)`,exact:true});
    for(const link of [launch,guide]){assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener');}
    assert.equal(new URL(await guide.getAttribute('href')).pathname,guidePaths[index]);
    const expected=published?`https://pazneria.github.io/${['racegpt','osrs-clone','sword-guys',null,null,'rebound-relay'][index]}/`
      :index===0?'http://127.0.0.1:5178/':index===2?'http://127.0.0.1:5179/':`https://pazneria.github.io/${index===1?'osrs-clone':'rebound-relay'}/`;
    assert.equal(await launch.getAttribute('href'),expected);
  }
  const codex=new URL(await page.getByRole('link',{name:'Open OSRS Clone guide (opens in new tab)',exact:true}).getAttribute('href'));
  assert.equal(codex.searchParams.get('from'),'arcade');assert.equal(codex.searchParams.get('return'),page.url());
  assert.equal(await page.locator('#cabinet-actions').isVisible(),false);
  if(failed){assert.match(await page.locator('#directory-message').innerText(),/unavailable/);assert.equal(await page.locator('#return-to-3d').isVisible(),false);}
  for(const name of ['Home','Exit Arcade'])assert.equal(await page.getByRole('link',{name,exact:true}).getAttribute('href'),'/');
  assert.deepEqual(await page.locator('#site-nav a').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),['/','/lab/lab-space/','/library/','./versions/']);
  assert.equal(await page.locator('a[href*="example.com"],a[href="undefined"]').count(),0);
}
async function ready(page) {
  await page.waitForFunction(()=>window.arcadeTest?.state.hasController&&!window.arcadeTest.state.failed&&window.arcadeTest.state.mode!=='loading',{},{timeout:90000});
  await page.waitForFunction(()=>document.getElementById('scene-loading').hidden);
  assert.equal(await page.locator('#scene-container canvas').count(),1);
}
async function start(page) {
  if(await page.locator('#cabinet-actions').isVisible())await page.getByRole('button',{name:'Back to aisle',exact:true}).click();
  if(await page.locator('#mobile-fallback').isVisible())await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).click();
  if(await page.locator('#controls').isVisible())await page.getByRole('button',{name:'Back to arcade',exact:true}).click();
  if(await page.evaluate(()=>window.arcadeTest.state.mode==='paused')) {
    await page.getByRole('button',{name:'Controls',exact:true}).click();await page.getByRole('button',{name:'Back to arcade',exact:true}).click();
  }
  await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore'&&window.arcadeTest.controller.active);
}
function assertDisposed(receipt,label) {
  assert(receipt,`${label}: navigation must produce a cleanup receipt`);
  assert.equal(receipt.app.hasController,false,label);assert.equal(receipt.app.canvasCount,0,label);
  const old=receipt.lastDisposed;assert(old,`${label}: active renderer had disposal evidence`);
  assert.equal(old.disposed,true,label);assert.equal(old.active,false,label);assert.equal(old.raf,0,label);
  assert.equal(old.connected,false,label);assert.equal(old.listenerCount,0,label);
  assert.equal(old.worldDisposeCount,1,label);assert.equal(old.rendererDisposeCount,1,label);
  assert(old.contextLossCount>=1,label);assert.deepEqual(old.keys,[],label);assert.equal(old.touchMove,0,label);
}
async function inspectAndVisit(page,index,action,receipts,entry) {
  await page.evaluate(i=>window.arcadeTest.inspect(i),index);
  await page.waitForFunction(i=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===i,index);
  const link=action==='guide'?page.locator('#cabinet-guide'):playControl(page,index);
  const base=await page.locator(action==='guide'?'#cabinet-guide':'#cabinet-play').getAttribute('href');
  const destination=action==='play'?gameDestination(base,index):base;
  const count=receipts.length,pages=page.context().pages().length;
  await link.focus();await page.keyboard.press('Enter');
  if(action==='play') {
    await page.waitForFunction(()=>window.arcadeTest.state.mode==='play');
    assert.equal(page.url(),entry,'Playing on a cabinet preserves the Arcade route');
    const frame=page.locator('#cabinet-game iframe');assert.equal(await frame.getAttribute('src'),destination);
    await page.frameLocator('#cabinet-game iframe').getByRole('heading',{name:'Test destination',exact:true}).waitFor();
    assert.equal(await page.locator('#cabinet-actions').getAttribute('data-screen-aligned'),'true');
    const before=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot());assert.equal(before.active,false);assert.equal(before.raf,0);
    await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot())).renderCount,before.renderCount,'Arcade does not render behind the game');
    if(new URL(destination).origin===new URL(entry).origin) {
      await page.frameLocator('#cabinet-game iframe').locator('body').press('Escape');await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');assert.equal(await frame.count(),0,'Child Escape removes its game document');
      await page.evaluate(i=>window.arcadeTest.inspect(i),index);await playControl(page,index).click();
    }
    await page.getByRole('button',{name:'Back to aisle',exact:true}).click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');assert.equal(await frame.count(),0,'Back removes the game document');
    await page.evaluate(i=>window.arcadeTest.inspect(i),index);await playControl(page,index).click();await page.locator('#game-full-page').click();
  }
  await page.waitForURL(destination,{waitUntil:'domcontentloaded'});
  assert.equal(page.context().pages().length,pages,'Cabinet action stays in the same tab');
  assert.equal(await page.getByRole('heading',{name:'Test destination',exact:true}).count(),1);
  assert.equal(receipts.length,count+1);assertDisposed(receipts.at(-1),`${action} ${names[index]}`);
  if(index===1&&action==='guide'){const url=new URL(page.url());assert.equal(url.searchParams.get('from'),'arcade');assert.equal(url.searchParams.get('return'),entry);}
  await page.goBack({waitUntil:'domcontentloaded'});await ready(page);
  await page.waitForFunction(i=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===i,index);
  assert.equal(await page.locator('#cabinet-title').innerText(),names[index]);
  assert.equal(await page.locator('#scene-container canvas').count(),1,'Back produces exactly one live renderer');
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.active),false);
}
function playControl(page,index){return page.locator(index===0?'#cabinet-hotspots [data-action="start"]':'#cabinet-play');}
function gameDestination(base,index){const url=new URL(base);if(index===0)url.searchParams.set('track','banked-shakedown');return url.href;}
async function assertPopup(page,locator) {
  const destination=await locator.getAttribute('href'),promise=page.waitForEvent('popup');await locator.click();const popup=await promise;
  try{await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),destination);
    assert.equal(await popup.evaluate(()=>window.opener===null),true);
    assert.equal(await popup.getByRole('heading',{name:'Test destination',exact:true}).count(),1);
  }finally{await popup.close();}
}
async function checkDirectoryFocusAndPopups(page,failed,published) {
  await assertDirectory(page,failed,published);
  const first=page.getByRole('link',{name:'Launch RaceGPT (opens in new tab)',exact:true});
  await first.focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Open RaceGPT guide (opens in new tab)');
  const guide=page.getByRole('link',{name:'Open OSRS Clone guide (opens in new tab)',exact:true});
  await guide.focus();await page.setViewportSize({width:420,height:800});
  assert(await guide.evaluate(element=>element===document.activeElement),'Directory resize preserves focus');
  await assertPopup(page,guide);
  await assertPopup(page,page.getByRole('link',{name:'Launch Rebound Relay (opens in new tab)',exact:true}));
  await assertPopup(page,page.getByRole('link',{name:'Launch Sword Guys (opens in new tab)',exact:true}));
  await assertDirectory(page,failed,published);
}
async function checkKeyboardAndPicking(page) {
  await start(page);const initial=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot());
  await page.keyboard.down('w');await page.waitForFunction(z=>window.arcadeTest.controller.player.z<z-.12,initial.player.z);await page.keyboard.up('w');
  await page.waitForTimeout(80);const stopped=await page.evaluate(()=>window.arcadeTest.controller.player.z);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.player.z),stopped,'Key release stops movement');
  await page.keyboard.press('c');await page.waitForFunction(()=>window.arcadeTest.controller.player.eye<1.5);
  await page.keyboard.press('r');assert.equal(await page.evaluate(()=>window.arcadeTest.controller.player.crouch),false);
  await page.keyboard.down('w');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('w');
  await page.waitForFunction(()=>window.arcadeTest.state.mode==='paused');
  assert.deepEqual(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().keys),[],'Blur cancels held keys');
  await start(page);const resetZ=await page.evaluate(()=>window.arcadeTest.controller.player.z);await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.player.z),resetZ);
  const yaw=await page.evaluate(()=>window.arcadeTest.controller.player.yaw);
  await page.mouse.move(580,400);await page.mouse.down();await page.mouse.move(760,470,{steps:5});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>window.arcadeTest.controller.player.yaw),yaw,'Drag fallback changes view');
  assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore','Dragging does not activate a cabinet');
  await page.keyboard.press('Tab');await page.waitForFunction(()=>window.arcadeTest.state.mode==='paused');await start(page);
  await page.evaluate(()=>window.arcadeTest.controller.__test.faceAnchor('game-0'));
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.pick()),'game-0','Nearby cabinet picks precisely');
  await page.evaluate(()=>window.arcadeTest.controller.__test.block('game-0'));
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.pick()),null,'Opaque geometry blocks interaction');
  await page.evaluate(()=>{const test=window.arcadeTest.controller.__test;test.unblock();test.faceAnchor('game-0',5);});
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.pick()),null,'Distant cabinets cannot activate');
  await page.evaluate(()=>window.arcadeTest.controller.__test.faceAnchor('game-0'));await page.keyboard.press('e');
  await page.waitForFunction(()=>window.arcadeTest.state.selected===0&&window.arcadeTest.state.mode==='inspect');
}
async function checkCabinetCatalog(page) {
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.anchors().filter(a=>a.kind==='game').length),6);
  assert.deepEqual(await page.evaluate(()=>window.arcadeTest.controller.__test.anchors().filter(a=>a.kind==='home').map(a=>a.id)),['home-entrance','home-exit']);
  await page.evaluate(()=>window.arcadeTest.inspect(0));
  for(let index=0;index<6;index++) {
    assert.equal(await page.locator('#cabinet-title').innerText(),names[index]);
    assert.equal(await playControl(page,index).isVisible(),![3,4].includes(index));
    assert.equal(await page.locator('#cabinet-guide').isVisible(),![3,4].includes(index));
    assert.equal(await page.locator('#coming-soon').isVisible(),[3,4].includes(index));
    if([3,4].includes(index)){assert.equal(await page.locator('#cabinet-play').getAttribute('href'),null);assert.equal(await page.locator('#cabinet-guide').getAttribute('href'),null);}
    await page.locator('#cabinet-next').click();
  }
  assert.equal(await page.evaluate(()=>window.arcadeTest.state.selected),0,'Next wraps in the established order');
  await page.locator('#cabinet-previous').click();
  assert.equal(await page.evaluate(()=>window.arcadeTest.state.selected),5,'Previous wraps to Rebound Relay');
}
async function checkPauseAndDirectory(page,mobile) {
  await start(page);const before=await page.evaluate(()=>window.arcadeTest.state);
  await page.getByRole('button',{name:'Games',exact:true}).click();await assertDirectory(page,false);
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.active),false);
  await page.waitForTimeout(100);const renderCount=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount);
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount),renderCount,'Directory stops the render loop');
  assert.deepEqual(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().player),before.controller.player);
  await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore');
  assert.equal(await page.evaluate(()=>window.arcadeTest.state.created),before.created,'Directory return reuses the renderer');
  assert.equal(await page.locator('#scene-container canvas').count(),1);
  await start(page);await page.keyboard.press('Escape');await page.waitForFunction(()=>window.arcadeTest.state.mode==='help');
  await page.waitForTimeout(80);const paused=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount);
  await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount),paused);
  for(const size of mobile?[{width:800,height:390},{width:390,height:800}]:[{width:1440,height:900},{width:1280,height:800}]) {
    await page.setViewportSize(size);assert.equal(await page.locator('#scene-container canvas').count(),1);
    const pixels=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().pixels);
    assert(pixels<=(mobile?900000:2304000)+2,'Drawing buffer respects the device pixel budget');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Navigation and panels fit the viewport');
  }
}
async function checkTouch(page,context) {
  await start(page);assert(await page.locator('#touch-controls').isVisible());const cdp=await context.newCDPSession(page);
  try {
    const box=await page.getByRole('button',{name:'Move forward',exact:true}).boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2};
    const z=await page.evaluate(()=>window.arcadeTest.controller.player.z);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await page.waitForFunction(z=>window.arcadeTest.controller.player.z<z-.1,z);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().touchMove),0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().touchMove),0,'Cancelled touch stops movement');
    const stopped=await page.evaluate(()=>window.arcadeTest.controller.player.z);await page.waitForTimeout(160);
    assert.equal(await page.evaluate(()=>window.arcadeTest.controller.player.z),stopped);
    const yaw=await page.evaluate(()=>window.arcadeTest.controller.player.yaw);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:350}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:260,y:390}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await page.evaluate(()=>window.arcadeTest.controller.player.yaw),yaw);
    assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore','Touch drag does not activate');
    assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().gesture),false);
    await page.evaluate(()=>window.arcadeTest.controller.__test.faceAnchor('game-0'));
    const cabinetPoint=await page.evaluate(()=>window.arcadeTest.controller.__test.point('game-0'));
    await page.touchscreen.tap(cabinetPoint.x,cabinetPoint.y);
    await page.waitForFunction(()=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===0);
    await page.setViewportSize({width:800,height:390});const guide=await page.locator('#cabinet-guide').boundingBox();
    assert(guide.width>=44&&guide.height>=44&&guide.y>=0&&guide.y+guide.height<=390,'Guide touch target fits landscape');
    await page.setViewportSize({width:390,height:800});
  } finally {await cdp.detach();}
}
async function checkBfCacheLifecycle(page) {
  await page.evaluate(()=>{window.arcadeTest.inspect(2);window.arcadeTest.save(2);window.__oldArcadeController=window.arcadeTest.controller;
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
  const old=await page.evaluate(()=>window.__oldArcadeController.__test.snapshot());
  assert.equal(await page.locator('#scene-container canvas').count(),0);
  assert.equal(old.disposed,true);assert.equal(old.listenerCount,0);assert.equal(old.raf,0);
  await page.keyboard.press('w');await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__oldArcadeController.__test.snapshot().renderCount),old.renderCount,'Disposed BFcache renderer cannot restart');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await ready(page);
  await page.waitForFunction(()=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===2);
  assert.equal(await page.locator('#scene-container canvas').count(),1);
  assert.equal(await page.evaluate(()=>window.__oldArcadeController.__test.snapshot().worldDisposeCount),1);
  await page.evaluate(()=>{delete window.__oldArcadeController;});
  console.log('PASS simulated persisted pagehide/pageshow disposal and restoration');
}
async function checkHomeDoors(page,receipts,entry) {
  for(const [id,activation] of [['home-entrance','keyboard'],['home-exit','click']]) {
    await start(page);await page.evaluate(id=>window.arcadeTest.controller.__test.faceAnchor(id),id);
    assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.pick()),id,`${id} is reachable by its physical target`);
    const count=receipts.length;
    if(activation==='keyboard')await page.keyboard.press('e');
    else{const point=await page.evaluate(id=>window.arcadeTest.controller.__test.point(id),id);await page.mouse.click(point.x,point.y);}
    await page.waitForURL(new URL('/',entry).href,{waitUntil:'domcontentloaded'});
    assert.equal(receipts.length,count+1);assertDisposed(receipts.at(-1),id);
    await page.goBack({waitUntil:'domcontentloaded'});await ready(page);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('arcade:return-state:v1')),null,'Home clears game-return state');
    await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');
  }
}
async function checkContextLoss(page) {
  await start(page);await page.evaluate(()=>window.arcadeTest.controller.__test.loseContext());
  await page.waitForFunction(()=>window.arcadeTest.state.failed&&!window.arcadeTest.state.hasController);
  await assertDirectory(page,true);assert.equal(await page.locator('#scene-container canvas').count(),0);
  const disposed=await page.evaluate(()=>window.arcadeTest.lastDisposed);
  assert.equal(disposed.disposed,true);assert.equal(disposed.raf,0);assert.equal(disposed.listenerCount,0);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
}
async function runCase(browser,localOrigin,mode) {
  const mobile=mode==='mobile'||mode==='no-webgl-mobile',published=mode==='published';
  const failed=mode.startsWith('no-webgl')||['renderer-failure','import-failure','published'].includes(mode);
  const context=await browser.newContext({viewport:{width:mobile?390:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?3:1});
  const receipts=[],unexpected=[],errors=[];
  try {
    await routeAll(context,localOrigin,mode,unexpected);
    await context.exposeBinding('__recordArcadeNavigation',(_source,receipt)=>{receipts.push(receipt);});
    await context.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new Error('Test pointer-lock unavailable'));});
    if(mode.startsWith('no-webgl')||published)await context.addInitScript(()=>{
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){return /^(webgl2?|experimental-webgl)$/.test(type)?null:getContext.call(this,type,...args);};
    });
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    if(process.env.TRACE_NAV)page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log(`${mode} navigation: ${frame.url()}`);});
    const entry=published?'https://pazneria.github.io/arcade/':`${localOrigin}/arcade/`;
    const capture=async name=>{if(!process.env.ARTIFACT_DIR)return;fs.mkdirSync(process.env.ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,`${mode}-${name}.png`)});};
    await page.goto(entry,{waitUntil:'domcontentloaded'});
    if(failed) {
      await page.waitForFunction(()=>window.arcadeTest?.state.failed,{},{timeout:90000});
      await assertDirectory(page,true,published);assert.equal(await page.locator('#scene-container canvas').count(),0);
      await checkDirectoryFocusAndPopups(page,true,published);await capture('fallback');
      for(const name of ['Home','Exit Arcade']) {
        await page.getByRole('link',{name,exact:true}).click();await page.waitForURL(new URL('/',entry).href,{waitUntil:'domcontentloaded'});
        const receipt=receipts.at(-1);assert.equal(receipt.app.hasController,false);assert.equal(receipt.app.canvasCount,0);
        await page.goBack({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.arcadeTest?.state.failed);
        await assertDirectory(page,true,published);
      }
    } else {
      await ready(page);assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore');
      assert.equal(await page.locator('#welcome,#explore').count(),0,'Direct entry has no welcome or mandatory Enter button');
      assert.equal(await page.evaluate(()=>document.pointerLockElement),null,'Loading never requests pointer lock');
      console.log(`${mode}: renderer identity`,await page.evaluate(()=>window.arcadeTest.controller.__test.graphics()));
      if(mobile)await checkTouch(page,context);else await checkKeyboardAndPicking(page);
      await checkCabinetCatalog(page);await checkPauseAndDirectory(page,mobile);await capture('room');
      for(const index of mobile?[1]:[0,1,2,5])await inspectAndVisit(page,index,'guide',receipts,entry);
      for(const index of mobile?[0]:[0,1,2,5])await inspectAndVisit(page,index,'play',receipts,entry);
      const pageShows=await page.evaluate(()=>window.arcadeTest.state.pageShows);
      console.log(`${mode}: real Back pageshow persisted=${pageShows.some(e=>e.persisted)} (browser-controlled)`);
      await checkBfCacheLifecycle(page);if(!mobile)await checkHomeDoors(page,receipts,entry);
      await checkContextLoss(page);await page.getByRole('button',{name:'Games',exact:true}).click();
      await checkDirectoryFocusAndPopups(page,false,false);await capture('directory');
      console.log(`${mode}: functional renderer counters only; no performance conclusion`,await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderStats));
    }
    assert.deepEqual(unexpected,[],`${mode}: no external or unstubbed requests`);
    assert.deepEqual(errors,[],`${mode}: no unhandled browser errors`);console.log(`PASS ${mode}`);
  } finally {await withDeadline(context.close(),'QA context close');}
}
async function run() {
  checkFixtureSyntax();const selected=process.env.TEST_MODE?process.env.TEST_MODE.split(','):modes;
  for(const mode of selected)assert(modes.includes(mode),`Unknown TEST_MODE: ${mode}`);
  let server,browser,browserServer,browserProcess,port;const receipt={startedAt:new Date().toISOString(),cases:[],cleanup:{}};
  try {
    server=createFixtureServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    port=server.address().port;const localOrigin=`http://127.0.0.1:${port}`,{chromium}=require('playwright');
    // Exactly one browser process; cases and contexts run sequentially.
    browserServer=await chromium.launchServer({channel:process.env.BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
    browserProcess=browserServer.process();receipt.browserPid=browserProcess.pid;receipt.serverPort=port;
    browser=await chromium.connect(browserServer.wsEndpoint());receipt.browserVersion=browser.version();
    for(const mode of selected){await runCase(browser,localOrigin,mode);receipt.cases.push({mode,passed:true});}
    receipt.passed=true;
  } catch(error) {
    receipt.passed=false;receipt.error=error.stack;throw error;
  } finally {
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess,server});receipt.endedAt=new Date().toISOString();
    if(!receipt.cleanup.complete)receipt.passed=false;
    if(process.env.ARTIFACT_DIR){fs.mkdirSync(process.env.ARTIFACT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.ARTIFACT_DIR,'browser-cleanup-receipt.json'),JSON.stringify(receipt,null,2));}
    console.log('Owned browser/server cleanup:',receipt.cleanup);
  }
  assert(receipt.cleanup.complete,'Owned QA resources must close');
}
if(require.main===module) {
  if(process.argv.includes('--check-fixtures')){try{checkFixtureSyntax();}catch(error){console.error(error);process.exitCode=1;}}
  else run().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={instrumentApp,instrumentController,checkFixtureSyntax,createFixtureServer,routeAll,ready,runCase,playControl,gameDestination};
