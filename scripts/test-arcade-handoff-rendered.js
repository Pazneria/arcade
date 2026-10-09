// Actual homepage source + candidate Arcade + accepted entrance JPEG, locally
// fulfilled at the exact public URLs. One background Chrome, no external room
// engines or user profile. The canonical inline bootstrap is not changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {instrumentApp,instrumentController,ready}=require('./test-directory-browser');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
const {descendants,alive}=require('./test-arcade-rendered');
const root=path.resolve(__dirname,'..'),site='https://pazneria.github.io',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
  assert(process.env.ARTIFACT_DIR&&process.env.HOMEPAGE_ROOT,'Set owned output and prepared homepage root');
  const output=path.resolve(process.env.ARTIFACT_DIR),home=path.resolve(process.env.HOMEPAGE_ROOT);fs.mkdirSync(output,{recursive:true});
  const image=fs.readFileSync(path.join(home,'assets/images/rooms/arcade-entry.jpg'));
  const receipt={startedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),homepageBase:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:home,encoding:'utf8'}).trim(),imageSha256:hash(image),cases:[],nodePid:process.pid,performanceMeasured:false};
  let browserServer,browser,browserProcess;const owned=new Map();
  try{
    const {chromium}=require('playwright');browserServer=await chromium.launchServer({channel:'chrome',headless:true,timeout:15000});browserProcess=browserServer.process();receipt.browserPid=browserProcess.pid;
    browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:15000});receipt.browserVersion=browser.version();
    for(const [name,viewport,reduced] of [['desktop',{width:1707,height:923},false],['portrait',{width:390,height:844},false],['reduced',{width:1707,height:923},true]]){
      const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'});
      let release;const gate=new Promise(resolve=>release=resolve),unexpected=[],errors=[],navigation=[];
      try{
        await context.exposeBinding('__recordArcadeNavigation',(_,r)=>navigation.push(r));
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url());if(url.origin!==site){unexpected.push(url.href);return route.abort('blockedbyclient');}
          if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
          const arcade=url.pathname.startsWith('/arcade/'),relative=decodeURIComponent(arcade?url.pathname.slice(8):url.pathname.slice(1))||'index.html',base=arcade?root:home,file=path.resolve(base,relative);
          if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing prepared fixture'});
          if(arcade&&relative==='assets/vendor/three.module.js')await gate;
          let body=fs.readFileSync(file);
          if(arcade&&relative==='assets/arcade-app.js')body=Buffer.from(instrumentApp(body.toString('utf8').replace(/\r\n/g,'\n')));
          if(arcade&&relative==='assets/arcade-controller.js')body=Buffer.from(instrumentController(body.toString('utf8').replace(/\r\n/g,'\n')));
          return route.fulfill({body,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(relative)]||'application/octet-stream'});
        });
        await context.addInitScript(()=>{
          window.__handoffSamples=[];window.__handoffReady=null;
          const state=()=>{const c=window.arcadeTest?.controller;return {cover:document.documentElement?.dataset.roomHandoff||null,active:window.pazneriaRoomHandoff?.active||false,mode:window.arcadeTest?.state.mode,controller:c?.__test.snapshot()||null,camera:c?.__test.camera()||null};};
          let documentObserver;
          const observeRoot=()=>{if(!document.documentElement)return;documentObserver?.disconnect();new MutationObserver(()=>{if(document.documentElement.dataset.roomHandoff==='ready')window.__handoffReady=state();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-room-handoff']});};
          if(document.documentElement)observeRoot();else{documentObserver=new MutationObserver(observeRoot);documentObserver.observe(document,{childList:true});}
          let count=0;const sample=()=>{window.__handoffSamples.push(state());if(++count<300&&(!window.arcadeTest?.controller?.active||count<10))requestAnimationFrame(sample);};requestAnimationFrame(sample);
        });
        const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
        await page.goto(site+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{const im=document.querySelector('#arcade img');return im.complete&&im.naturalWidth===1707;});
        await page.locator('#arcade .visit-link').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-homepage.png')});
        await page.locator('#arcade .visit-link').click();await page.waitForURL(site+'/arcade/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.pazneriaRoomHandoff?.active&&window.arcadeTest?.state.mode==='loading');
        const loading=await page.evaluate(()=>({token:sessionStorage.getItem('pazneria.room-handoff.v1'),cover:document.documentElement.dataset.roomHandoff,background:getComputedStyle(document.documentElement,'::after').backgroundImage,inert:['scene-container','site-nav','controls','cabinet-actions','mobile-fallback','touch-controls'].every(id=>document.getElementById(id).inert),canvas:document.querySelectorAll('#scene-container canvas').length,loader:getComputedStyle(document.getElementById('scene-loading')).visibility}));
        assert.equal(loading.token,null);assert.equal(loading.cover,'loading');assert(loading.background.includes('/assets/images/rooms/arcade-entry.jpg'));assert(loading.inert);assert.equal(loading.canvas,0);assert.equal(loading.loader,'hidden');
        await page.screenshot({path:path.join(output,name+'-cover.png')});release();await withDeadline(ready(page),'Shared cover matching scene readiness',30000);
        await page.waitForFunction(()=>!window.pazneriaRoomHandoff.active&&window.arcadeTest.controller.active);
        const revealed=await page.evaluate(()=>({token:sessionStorage.getItem('pazneria.room-handoff.v1'),state:window.arcadeTest.state,camera:window.arcadeTest.controller.__test.camera(),ready:window.__handoffReady,samples:window.__handoffSamples,focus:document.activeElement.tagName,lock:!!document.pointerLockElement,inert:document.getElementById('scene-container').inert}));
        assert.equal(revealed.token,null);assert.equal(revealed.state.mode,'explore');assert.equal(revealed.focus,'CANVAS');assert.equal(revealed.lock,false);assert.equal(revealed.inert,false);assert.deepEqual(revealed.camera.position,[0,1.62,-.95]);assert.equal(revealed.camera.yaw,0);assert.equal(revealed.camera.pitch,-.04);assert.equal(revealed.camera.aspect,viewport.width/viewport.height);
        assert(revealed.samples.every(s=>!s.active||!s.controller?.active),'Input and RAF remain gated while covered');
        if(!reduced){assert(revealed.ready?.controller.renderCount>0);assert.equal(revealed.ready.controller.active,false);assert.equal(revealed.ready.controller.raf,0);assert.deepEqual(revealed.ready.camera.position,[0,1.62,-.95]);}
        await page.screenshot({path:path.join(output,name+'-revealed.png')});descendants(browserProcess.pid).forEach(i=>owned.set(i.pid,i));
        await page.getByRole('link',{name:'Home / Exit',exact:true}).click();await page.waitForURL(site+'/',{waitUntil:'domcontentloaded'});
        assert.equal(navigation.length,1);assert.equal(navigation[0].app.hasController,false);assert.equal(navigation[0].app.canvasCount,0);assert.equal(navigation[0].lastDisposed.raf,0);assert.equal(navigation[0].lastDisposed.listenerCount,0);
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('pazneria.room-handoff.v1')),null);assert.equal(await page.locator('#entry-cover').isVisible(),false);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
        receipt.cases.push({name,viewport,reducedMotion:reduced,loading,revealed,homeDisposal:navigation[0].lastDisposed,passed:true});console.log('PASS actual homepage source/image handoff',name);
      }finally{release();await withDeadline(context.close(),'Handoff context close');}
    }
    receipt.passed=true;
  }catch(error){receipt.passed=false;receipt.error=error.stack;throw error;}
  finally{
    if(browserProcess)try{descendants(browserProcess.pid).forEach(i=>owned.set(i.pid,i));}catch(error){receipt.ownedProcessCheckError=error.message;}
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess});receipt.cleanup.ownedChromeProcesses=[...owned.values()];
    try{receipt.cleanup.remainingOwnedPids=owned.size?alive([...owned.values()]):[];if(receipt.cleanup.remainingOwnedPids.length)receipt.cleanup.complete=false;}catch(error){receipt.cleanup.complete=false;receipt.cleanup.errors.push({step:'Owned Chrome identity check',error:error.message});}
    if(receipt.ownedProcessCheckError)receipt.cleanup.complete=false;
    if(!receipt.cleanup.complete)receipt.passed=false;receipt.endedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'handoff-rendered-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Handoff owned cleanup:',receipt.cleanup);
  }
  assert(receipt.passed&&receipt.cleanup.complete);
}
if(require.main===module){if(process.argv.includes('--check-fixtures'))console.log('Handoff helper parsed only; no browser/server.');else main().catch(e=>{console.error(e);process.exitCode=1;});}
