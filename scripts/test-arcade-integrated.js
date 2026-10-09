// Bounded acceptance, not a benchmark. One fresh background Chrome; sequential
// contexts. Public game GETs only; no user profile or original benchmark assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {instrumentApp,instrumentController,ready,checkFixtureSyntax,playControl,gameDestination}=require('./test-directory-browser');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
const {descendants,alive}=require('./test-arcade-rendered');
const root=path.resolve(__dirname,'..'),site='https://pazneria.github.io';
const games=[[0,'racegpt'],[1,'osrs-clone'],[2,'sword-guys'],[5,'rebound-relay']];
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
function controllerFixture(){return instrumentController(read('assets/arcade-controller.js')).replace('  const __test={','  const __test={\n    exits(){return world.exits.snapshot();},');}
const stub='<!doctype html><html><body><h1>Home fixture</h1></body></html>';
async function routeCandidate(context,receipt){
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['GET','HEAD'].includes(req.method())){receipt.blockedWrites.push({method:req.method(),url:url.href});return route.abort('blockedbyclient');}
    if(url.origin===site&&url.pathname.startsWith('/arcade/')){
      const relative=decodeURIComponent(url.pathname.slice(8))||'index.html',file=path.resolve(root,relative);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing candidate fixture'});
      let body=fs.readFileSync(file);
      if(relative==='assets/arcade-app.js')body=Buffer.from(instrumentApp(body.toString('utf8').replace(/\r\n/g,'\n')));
      if(relative==='assets/arcade-controller.js')body=Buffer.from(controllerFixture());
      const type=({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json'})[path.extname(relative)]||'application/octet-stream';
      return route.fulfill({contentType:type,body});
    }
    if(url.origin===site&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:stub});
    if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
    // Allow only the four existing public game namespaces and static libraries.
    if(url.origin===site&&games.some(([,name])=>url.pathname.startsWith('/'+name+'/')))return route.continue();
    if(['https://cdn.tailwindcss.com','https://cdn.jsdelivr.net','https://unpkg.com','https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(url.origin))return route.continue();
    receipt.blockedOther.push(url.href);return route.abort('blockedbyclient');
  });
  await context.addInitScript(()=>{
    // Include initial about:blank documents: Chrome can create an iframe before
    // its final path is observable to this pre-document instrumentation.
    const qa=window.__arcadeGameQA={rafCallbacks:0,intervalCallbacks:0,keyEvents:0,draws:0,initialStorage:[],listeners:[],loaded:false,storageWrites:[]};
    const add=window.addEventListener.bind(window);add('load',()=>qa.loaded=true);
    window.addEventListener=(type,callback,...options)=>{if(['keydown','keyup'].includes(type))qa.listeners.push({type,cabinet:String(callback).includes('onEscape()')});return add(type,callback,...options);};
    for(const name of ['setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){if(this===localStorage)qa.storageWrites.push({action:name,key:args[0]||null});return original.apply(this,args);};}
    try{qa.initialStorage=Object.keys(localStorage);}catch{}
    const raf=window.requestAnimationFrame.bind(window),interval=window.setInterval.bind(window);
    window.requestAnimationFrame=callback=>raf(time=>{qa.rafCallbacks++;callback(time);});
    window.setInterval=(callback,ms,...args)=>interval(typeof callback==='function'?()=>{qa.intervalCallbacks++;callback(...args);}:callback,ms,...args);
    window.addEventListener('keydown',()=>qa.keyEvents++,true);
    for(const [proto,names] of [[CanvasRenderingContext2D.prototype,['clearRect','fillRect','drawImage']],
      [WebGLRenderingContext.prototype,['drawArrays','drawElements']],
      [WebGL2RenderingContext.prototype,['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']]])
      for(const name of names){const original=proto[name];if(original)proto[name]=function(...args){qa.draws++;return original.apply(this,args);};}
  });
}
async function shot(page,output,name){await page.screenshot({path:path.join(output,name+'.png'),timeout:15000});}
function disposed(r){assert(r);assert.equal(r.app.hasController,false);assert.equal(r.app.canvasCount,0);assert.equal(r.lastDisposed.raf,0);assert.equal(r.lastDisposed.listenerCount,0);assert.equal(r.lastDisposed.worldDisposeCount,1);assert.equal(r.lastDisposed.rendererDisposeCount,1);assert(r.lastDisposed.contextLossCount>=1);}
async function walkDoors(browser,output,receipt,observe){
  for(const reduced of [false,true]){
    const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'});
    try{
      await routeCandidate(context,receipt);const navigation=[];await context.exposeBinding('__recordArcadeNavigation',(_,r)=>navigation.push(r));
      const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(site+'/arcade/',{waitUntil:'domcontentloaded'});await withDeadline(ready(page),'Walking default readiness',30000);observe();
      for(const [id,x,z,yaw] of [['home-entrance',0,-1.05,Math.PI],['home-exit',-2.75,-9.95,0]]){
        const beforeNavigation=navigation.length;
        await page.evaluate(p=>{const c=window.arcadeTest.controller;c.pause();c.reset();Object.assign(c.player,p);c.resume();},{x,z,yaw,pitch:0,eye:1.62,crouch:false});
        await page.waitForFunction(id=>window.arcadeTest.controller.__test.exits().find(d=>d.id===id).open===1,id);
        const opened=await page.evaluate(id=>window.arcadeTest.controller.__test.exits().find(d=>d.id===id),id);
        assert(opened.armed);assert.equal(navigation.length,beforeNavigation,'Approach alone does not navigate');
        await shot(page,output,`${reduced?'reduced':'normal'}-${id}-open`);
        // Backing away closes the leaf without leaving the Arcade.
        await page.keyboard.down('s');await page.waitForFunction(({id,z})=>Math.abs(window.arcadeTest.controller.player.z-z)>1.1,{id,z});await page.keyboard.up('s');
        await page.waitForFunction(id=>window.arcadeTest.controller.__test.exits().find(d=>d.id===id).open===0,id);assert.equal(page.url(),site+'/arcade/');
        await page.keyboard.down('w');await page.waitForURL(site+'/',{waitUntil:'domcontentloaded',timeout:15000});await page.keyboard.up('w');
        disposed(navigation.at(-1));receipt.walkingExits.push({id,reducedMotion:reduced,approachOpens:true,retreatCloses:true,walkingNavigates:true,disposal:navigation.at(-1).lastDisposed});
        await page.goBack({waitUntil:'domcontentloaded'});await withDeadline(ready(page),'Walking return readiness',30000);assert.equal(await page.evaluate(()=>sessionStorage.getItem('arcade:return-state:v1')),null);
      }
    }finally{await withDeadline(context.close(),'Walking context close');}
  }
}
async function actualGames(browser,output,receipt,observe){
  for(const [index,name] of games){
  const context=await browser.newContext({viewport:{width:1707,height:923},deviceScaleFactor:1,serviceWorkers:'block'});
  try{
    await routeCandidate(context,receipt);const navigation=[];await context.exposeBinding('__recordArcadeNavigation',(_,r)=>navigation.push(r));
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>receipt.gamePageErrors.push(e.message));
    page.on('requestfailed',r=>receipt.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
    await page.goto(site+'/arcade/',{waitUntil:'domcontentloaded'});await withDeadline(ready(page),'Real games Arcade readiness',30000);observe();
    receipt.graphics=await page.evaluate(()=>window.arcadeTest.controller.__test.graphics());
      await page.evaluate(i=>window.arcadeTest.controller.__test.faceAnchor('game-'+i),index);
      const aisle=await page.evaluate(()=>({...window.arcadeTest.controller.player}));await page.keyboard.press('e');
      await page.waitForFunction(i=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===i,index);
      assert.equal(await page.locator('#cabinet-actions').getAttribute('data-screen-aligned'),'true');await shot(page,output,name+'-selection');
      assert.equal(await page.locator('#cabinet-play').getAttribute('href'),site+'/'+name+'/');await playControl(page,index).click();
      await page.waitForFunction(()=>window.arcadeTest.state.mode==='play');const c=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot());assert.equal(c.active,false);assert.equal(c.raf,0);
      try {await page.waitForFunction(name=>{const f=document.querySelector('#cabinet-game iframe');try{return f?.contentWindow.location.pathname.startsWith('/'+name+'/')&&f.contentWindow.__arcadeGameQA&&!!f.contentDocument.querySelector('canvas');}catch{return false;}},name,{timeout:15000});}
      catch(error){receipt.failedGame={name,frames:[]};for(const f of page.frames())receipt.failedGame.frames.push({url:f.url(),state:await f.evaluate(()=>({text:document.body?.innerText?.slice(0,2500),qa:window.__arcadeGameQA,canvas:[...document.querySelectorAll('canvas')].map(c=>[c.width,c.height])})).catch(e=>e.message)});await shot(page,output,name+'-failed');throw error;}
      const frame=page.frames().find(f=>f.url().startsWith(site+'/'+name+'/'));assert(frame);await frame.waitForLoadState('domcontentloaded');
      const before=await frame.evaluate(()=>({title:document.title,qa:{...window.__arcadeGameQA},canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),body:document.body.innerText.slice(0,2500)}));
      assert.deepEqual(before.qa.initialStorage,[],'Fresh ephemeral game profile has no real user saves');assert(before.canvases.length);
      if(name==='racegpt')await frame.locator('#start-button').click();
      if(name==='rebound-relay')await frame.locator('#start').click();
      if(name==='osrs-clone'){
        if(await frame.locator('#player-entry-name').count())await frame.locator('#player-entry-name').fill('Arcade QA');
        if(await frame.locator('#player-entry-primary').isVisible())await frame.locator('#player-entry-primary').click();
      }
      await frame.waitForFunction(()=>window.__arcadeGameQA.draws>20,{},{timeout:30000});
      await frame.locator('canvas').first().click({position:{x:80,y:80},force:true});await page.keyboard.down(name==='racegpt'?'ArrowUp':'w');await page.waitForTimeout(250);await page.keyboard.up(name==='racegpt'?'ArrowUp':'w');
      const after=await frame.evaluate(()=>({qa:{...window.__arcadeGameQA},storageKeys:Object.keys(localStorage),fullscreen:!!document.fullscreenElement}));
      assert(after.qa.keyEvents>before.qa.keyEvents);assert(after.qa.draws>before.qa.draws);assert.equal((await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot())).renderCount,c.renderCount,'Arcade RAF remains paused during real game input');
      await shot(page,output,name+'-playing');
      await page.evaluate(()=>{window.__qaRetiredGame=document.querySelector('#cabinet-game iframe').contentWindow.__arcadeGameQA;});
      await frame.locator('body').press('Escape');
      try{await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore',{},{timeout:3000});}
      catch(error){receipt.failedEscape={name,parent:await page.evaluate(()=>({state:window.arcadeTest.state,focus:document.hasFocus(),active:document.activeElement?.tagName,lock:!!document.pointerLockElement})),qa:await frame.evaluate(()=>({...window.__arcadeGameQA,readyState:document.readyState})).catch(e=>e.message)};await shot(page,output,name+'-failed-escape');throw error;}
      assert.equal(await page.locator('#cabinet-game iframe').count(),0);
      assert.deepEqual(await page.evaluate(()=>({...window.arcadeTest.controller.player})),aisle,'Return restores the original aisle pose');
      const returnedKeys=await page.evaluate(()=>Object.keys(localStorage));assert(after.storageKeys.every(key=>returnedKeys.includes(key)),'Game-owned keys survive return; games may save newer values on exit');
      assert.deepEqual(await page.evaluate(()=>window.__arcadeGameQA.storageWrites),[],'Arcade never writes or removes game-owned local storage');
      if(name==='osrs-clone')assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('osrsClone.progress.v2')).state.profile.name),'Arcade QA','Native game exit preserves the disposable character save');
      const retired=await page.evaluate(()=>({...window.__qaRetiredGame}));await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>({...window.__qaRetiredGame})),retired,'Detached game RAF/timers stop');
      await page.mouse.move(800,450);const yaw=await page.evaluate(()=>window.arcadeTest.controller.player.yaw);await page.mouse.move(840,450);await page.waitForFunction(y=>window.arcadeTest.controller.player.yaw!==y,yaw);
      receipt.realGames.push({index,name,url:frame.url(),before,after,returnedKeys,childEscapeReturns:true,gameTeardownStopsCallbacks:true,aislePoseRestored:true,immediateMouseLook:true,arcadePausedWhilePlaying:true,gameOwnedStorageKeysRetained:true,arcadeLocalStorageWrites:0});
      // Reopen the same game, use the persistent Back control, then test full-page
      // launch and actual browser Back with exactly one restored Arcade renderer.
      await page.evaluate(i=>window.arcadeTest.inspect(i),index);await playControl(page,index).click();await page.getByRole('button',{name:'Back to aisle',exact:true}).click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');assert.equal(await page.locator('#cabinet-game iframe').count(),0);
      await page.evaluate(i=>window.arcadeTest.inspect(i),index);await playControl(page,index).click();await page.locator('#game-full-page').click();await page.waitForURL(gameDestination(site+'/'+name+'/',index),{waitUntil:'domcontentloaded'});disposed(navigation.at(-1));
      await page.goBack({waitUntil:'domcontentloaded'});await withDeadline(ready(page),'Real full-page Back readiness',30000);await page.waitForFunction(i=>window.arcadeTest.state.mode==='inspect'&&window.arcadeTest.state.selected===i,index);assert.equal(await page.locator('#scene-container canvas').count(),1);
      receipt.realGames.at(-1).backControlReturns=true;receipt.realGames.at(-1).fullPageDisposes=true;receipt.realGames.at(-1).browserBackRestoresOneRenderer=true;
      console.log('PASS real game screen/input/return/disposal:',name);
      await page.getByRole('button',{name:'Back to aisle',exact:true}).click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');
  }finally{await withDeadline(context.close(),'Real game context close');}
  }
}
async function main(){
  assert(process.env.ARTIFACT_DIR,'Use an owned ARTIFACT_DIR');const output=path.resolve(process.env.ARTIFACT_DIR);fs.mkdirSync(output,{recursive:true});
  const receipt={startedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),nodePid:process.pid,walkingExits:[],realGames:[],blockedWrites:[],blockedOther:[],gamePageErrors:[],requestFailures:[],performanceMeasured:false,userProfile:'Fresh nonpersistent Playwright contexts; no existing saves accessed'};
  let browserServer,browser,browserProcess;const owned=new Map();
  try{
    const {chromium}=require('playwright');browserServer=await chromium.launchServer({channel:'chrome',headless:true,timeout:15000});browserProcess=browserServer.process();receipt.browserPid=browserProcess.pid;
    browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:15000});receipt.browserVersion=browser.version();
    const observe=()=>descendants(browserProcess.pid).forEach(i=>owned.set(i.pid,i));
    if(process.env.QA_PHASE!=='games'){await walkDoors(browser,output,receipt,observe);console.log('PASS both outward walking exits, approach/retreat and disposal, normal/reduced motion');}
    await actualGames(browser,output,receipt,observe);console.log('PASS four real public game screens/input/Escape/Back/full-page teardown');observe();receipt.passed=true;
  }catch(error){receipt.passed=false;receipt.error=error.stack;throw error;}
  finally{
    if(browserProcess)try{descendants(browserProcess.pid).forEach(i=>owned.set(i.pid,i));}catch(error){receipt.ownedProcessCheckError=error.message;}
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess});receipt.cleanup.ownedChromeProcesses=[...owned.values()];
    try{receipt.cleanup.remainingOwnedPids=owned.size?alive([...owned.values()]):[];if(receipt.cleanup.remainingOwnedPids.length)receipt.cleanup.complete=false;}catch(error){receipt.cleanup.complete=false;receipt.cleanup.errors.push({step:'Owned Chrome identity check',error:error.message});}
    if(receipt.ownedProcessCheckError)receipt.cleanup.complete=false;
    if(!receipt.cleanup.complete)receipt.passed=false;receipt.endedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'integrated-qa-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Integrated owned cleanup:',receipt.cleanup);
  }
  assert(receipt.passed);assert(receipt.cleanup.complete);
}
if(require.main===module){if(process.argv.includes('--check-fixtures')){checkFixtureSyntax();new(require('node:vm').Script)(controllerFixture().replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''));console.log('Integrated fixture parsed; no browser/server.');}else main().catch(e=>{console.error(e);process.exitCode=1;});}
