// Bounded QA: one Chrome, sequential contexts, local fixtures/stub destinations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {instrumentApp,instrumentController,createFixtureServer,routeAll,ready,runCase}=require('./test-directory-browser');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
const root=path.resolve(__dirname,'..'),artifacts=process.env.ARTIFACT_DIR;
const baseline='3c01eb52876053f91fbb4ee014824fb2665734e2';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function descendants(pid){
  if(process.platform!=='win32')return [{pid}];
  // Identity matters: Windows can reuse a departed Chrome PID during the run.
  const script=`$qaIds=[System.Collections.Generic.List[int]]::new();$qaRecords=[System.Collections.Generic.List[object]]::new();$qaRoot=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}';if($qaRoot.Name -ne 'chrome.exe'){throw 'Owned Chrome root not found'};$qaIds.Add(${pid});$qaRecords.Add([pscustomobject]@{pid=${pid};name=$qaRoot.Name;created=$qaRoot.CreationDate.ToUniversalTime().ToString('o')});for($qaIndex=0;$qaIndex -lt $qaIds.Count;$qaIndex++){Get-CimInstance Win32_Process -Filter ('Name = ''chrome.exe'' AND ParentProcessId = '+$qaIds[$qaIndex]) | ForEach-Object {$qaIds.Add([int]$_.ProcessId);$qaRecords.Add([pscustomobject]@{pid=$_.ProcessId;name=$_.Name;created=$_.CreationDate.ToUniversalTime().ToString('o')})}};ConvertTo-Json -Compress -InputObject @($qaRecords)`;
  return JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'}));
}
function alive(identities){
  if(process.platform!=='win32')return [];
  const checks=identities.map(info=>`$qaCandidate=Get-CimInstance Win32_Process -Filter 'ProcessId = ${info.pid}';if($qaCandidate -and $qaCandidate.Name -eq '${info.name}' -and $qaCandidate.CreationDate.ToUniversalTime().ToString('o') -eq '${info.created}'){$qaRemaining.Add(${info.pid})}`).join(';');
  const script=`$qaRemaining=[System.Collections.Generic.List[int]]::new();${checks};ConvertTo-Json -Compress -InputObject @($qaRemaining)`;
  return JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'}));
}
async function screenshot(page,name){if(!artifacts)return null;const bytes=await page.screenshot({path:path.join(artifacts,name+'.png')});return hash(bytes);}
async function sceneImages(page,prefix){
  const images=[];
  for(const [name,anchor] of [['entrance',null],['feature','game-5'],['bank','game-0']]){
    await page.evaluate(anchor=>{
      for(const id of ['site-nav','welcome','controls','mobile-fallback','cabinet-actions','scene-loading','reticle','target-hint','touch-controls']){const el=document.getElementById(id);if(el)el.hidden=true;}
      const c=window.arcadeTest.controller;c.pause();document.activeElement?.blur();c.reset();if(anchor)c.__test.faceAnchor(anchor);c.__test.freezeElapsed();
    },anchor);
    const bytes=await page.locator('#scene-container canvas').screenshot({path:artifacts?path.join(artifacts,prefix+'-'+name+'.png'):undefined});
    images.push({name,sha256:hash(bytes)});
  }
  return images;
}
async function extras(browser,origin,receipt,observeOwned){
  let context;
  try{
    context=await browser.newContext({viewport:{width:1280,height:800}});const unexpected=[],navigations=[];
    await routeAll(context,origin,'normal',unexpected);await context.exposeBinding('__recordArcadeNavigation',(_,r)=>navigations.push(r));
    let release,requestStarted;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>requestStarted=resolve);
    await context.route('**/assets/vendor/three.module.js',async route=>{requestStarted();await gate;await route.continue();});
    await context.addInitScript(()=>{
      window.__loadStages=[];window.__coverage=[];
      document.addEventListener('DOMContentLoaded',()=>{
        const log=()=>{const label=document.getElementById('load-status')?.textContent;if(label&&window.__loadStages.at(-1)!==label)window.__loadStages.push(label);};
        log();new MutationObserver(log).observe(document.getElementById('scene-loading'),{childList:true,subtree:true,attributes:true});
        let samples=0;const sample=()=>{const cover=document.getElementById('scene-loading'),state=window.arcadeTest?.state;window.__coverage.push({cover:!cover?.hidden&&Number(getComputedStyle(cover).opacity)>.01,draws:state?.controller?.renderCount||0,canvas:state?.canvasCount||0,mode:state?.mode});if(++samples<180&&(!cover?.hidden||samples<15))requestAnimationFrame(sample);};requestAnimationFrame(sample);
      });
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/arcade/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__loadStages.length>0);await withDeadline(requested,'Initial vendor import request');
    assert.equal(await page.locator('#scene-loading').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 18, 20)');
    assert.equal(await page.locator('#welcome,#explore').count(),0);assert(await page.locator('#scene-loading').isVisible());await screenshot(page,'loading-engine');
    release();await ready(page);observeOwned();receipt.graphics=await page.evaluate(()=>window.arcadeTest.controller.__test.graphics());
    assert.deepEqual(await page.evaluate(()=>window.__loadStages),['Loading engine','Building scene','Preparing graphics','Opening Arcade','Ready']);
    const coverage=await page.evaluate(()=>window.__coverage);assert(coverage.length>3);assert(coverage.every(s=>s.cover||(s.canvas===1&&s.draws>0)),'Every sampled load/fade frame has a cover or a drawn scene');receipt.loadFrameSamples=coverage.length;
    await screenshot(page,'drop-in');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
    const z=await page.evaluate(()=>window.arcadeTest.controller.player.z);await page.keyboard.down('w');await page.waitForFunction(z=>window.arcadeTest.controller.player.z<z-.08,z);await page.keyboard.up('w');
    assert.equal(await page.evaluate(()=>document.pointerLockElement),null,'Keyboard movement works before pointer capture');
    await page.mouse.click(640,400);await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas'),{},{timeout:5000});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.arcadeTest.state.mode==='help');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'close-controls');await screenshot(page,'controls');
    await page.getByRole('button',{name:'Back to arcade',exact:true}).click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');
    receipt.backPointerLock=await page.evaluate(()=>document.pointerLockElement===document.querySelector('canvas'));
    await page.mouse.move(640,400);const yaw=await page.evaluate(()=>window.arcadeTest.controller.player.yaw);await page.mouse.move(680,400);await page.waitForFunction(yaw=>window.arcadeTest.controller.player.yaw!==yaw,yaw);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.arcadeTest.state.mode==='help');
    await page.keyboard.down('Escape');await page.keyboard.down('Escape');await page.keyboard.down('Escape');assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore');await page.keyboard.up('Escape');
    receipt.directEntryPointerAndHelp=true;receipt.currentImages=await sceneImages(page,'current');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  }finally{if(context)await withDeadline(context.close(),'Loading context close');}
  try{
    context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});await routeAll(context,origin,'normal',[]);await context.exposeBinding('__recordArcadeNavigation',()=>{});
    const page=await context.newPage();await page.goto(origin+'/arcade/');await ready(page);assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    assert.equal(await page.locator('#scene-loading').evaluate(el=>el.classList.contains('is-ready')),false,'Reduced motion skips the fading state');await screenshot(page,'reduced-motion');receipt.reducedMotion=true;
  }finally{if(context)await withDeadline(context.close(),'Reduced motion context close');}
  try{
    context=await browser.newContext({viewport:{width:1280,height:800}});await routeAll(context,origin,'normal',[]);await context.exposeBinding('__recordArcadeNavigation',()=>{});let block=true;
    await context.route('**/assets/vendor/three.module.js',route=>block?route.abort('failed'):route.continue());const page=await context.newPage();await page.goto(origin+'/arcade/');await page.waitForFunction(()=>window.arcadeTest?.state.failed);
    assert(await page.getByRole('button',{name:'Retry loading',exact:true}).isVisible());assert.equal(await page.locator('.fallback-card a').count(),8);await screenshot(page,'import-error');
    block=false;await page.getByRole('button',{name:'Retry loading',exact:true}).click();await ready(page);assert.equal(await page.evaluate(()=>window.arcadeTest.state.mode),'explore');receipt.retryRecovered=true;
  }finally{if(context)await withDeadline(context.close(),'Retry context close');}
  try{
    context=await browser.newContext({viewport:{width:1280,height:800}});await routeAll(context,origin,'normal',[]);await context.exposeBinding('__recordArcadeNavigation',()=>{});let release,requestStarted;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>requestStarted=resolve);
    await context.route('**/assets/vendor/three.module.js',async route=>{requestStarted();await gate;await route.continue();});const page=await context.newPage();await page.goto(origin+'/arcade/',{waitUntil:'domcontentloaded'});await withDeadline(requested,'Cancellation vendor import request');
    await page.getByRole('button',{name:'Games',exact:true}).click();assert(await page.locator('#mobile-fallback').isVisible());release();await page.waitForTimeout(200);
    assert.equal(await page.locator('#scene-container canvas').count(),0);assert.equal(await page.evaluate(()=>window.arcadeTest.state.created),0);
    await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).click();await ready(page);assert.equal(await page.evaluate(()=>window.arcadeTest.state.created),1);receipt.cancelAndReturn=true;
  }finally{if(context)await withDeadline(context.close(),'Cancellation context close');}
  try{
    context=await browser.newContext({viewport:{width:1280,height:800}});await context.exposeBinding('__recordArcadeNavigation',()=>{});await context.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(Error('Visual fixture uses drag fallback'));});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
      assert(url.origin===origin&&url.pathname.startsWith('/arcade/'),'Visual baseline contacts only local fixture paths');
      const relative=url.pathname.slice('/arcade/'.length)||'index.html';let body=cp.execFileSync('git',['cat-file','blob',baseline+':'+relative],{cwd:root,maxBuffer:12*1024*1024});
      if(relative==='assets/arcade-app.js')body=Buffer.from(instrumentApp(body.toString('utf8').replace(/\r\n/g,'\n')));
      if(relative==='assets/arcade-controller.js')body=Buffer.from(instrumentController(body.toString('utf8').replace(/\r\n/g,'\n')));
      return route.fulfill({contentType:relative.endsWith('.js')?'application/javascript':relative.endsWith('.css')?'text/css':'text/html',body});
    });
    const page=await context.newPage();await page.goto(origin+'/arcade/');await page.waitForFunction(()=>window.arcadeTest?.state.hasController);receipt.baselineGraphics=await page.evaluate(()=>window.arcadeTest.controller.__test.graphics());
    receipt.baselineImages=await sceneImages(page,'baseline');receipt.visualComparison=receipt.currentImages.map((image,i)=>({name:image.name,identicalPng:image.sha256===receipt.baselineImages[i].sha256}));
    assert.deepEqual(receipt.graphics,receipt.baselineGraphics,'Baseline uses the same renderer/backend');
  }finally{if(context)await withDeadline(context.close(),'Baseline context close');}
}
async function main(){
  if(artifacts)fs.mkdirSync(artifacts,{recursive:true});const receipt={startedAt:new Date().toISOString(),baseline,head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),cases:[],cleanup:{}};
  let server,browserServer,browser,processHandle;const owned=new Map();receipt.nodePid=process.pid;
  try{
    server=createFixtureServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});receipt.serverPort=server.address().port;const origin='http://127.0.0.1:'+receipt.serverPort;
    const {chromium}=require('playwright');browserServer=await chromium.launchServer({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});processHandle=browserServer.process();receipt.browserPid=processHandle.pid;
    browser=await chromium.connect(browserServer.wsEndpoint());receipt.browserVersion=browser.version();const observeOwned=()=>descendants(processHandle.pid).forEach(info=>owned.set(info.pid,info));
    await extras(browser,origin,receipt,observeOwned);console.log('PASS real loading/pointer/help/reduced motion/retry/cancel and visual captures',receipt.graphics,receipt.visualComparison);
    for(const mode of (process.env.TEST_MODE||'normal,mobile,no-webgl,renderer-failure,import-failure,published').split(',')){await runCase(browser,origin,mode);receipt.cases.push({mode,passed:true});}
    observeOwned();receipt.passed=true;
  }catch(error){receipt.passed=false;receipt.error=error.stack;throw error;}
  finally{
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess:processHandle,server});receipt.cleanup.ownedChromeProcesses=[...owned.values()];
    try{receipt.cleanup.remainingOwnedPids=owned.size?alive([...owned.values()]):[];if(receipt.cleanup.remainingOwnedPids.length)receipt.cleanup.complete=false;}
    catch(error){receipt.cleanup.complete=false;receipt.cleanup.errors.push({step:'owned Chrome identity check',error:error.message});}
    if(!receipt.cleanup.complete)receipt.passed=false;receipt.endedAt=new Date().toISOString();
    if(artifacts)fs.writeFileSync(path.join(artifacts,'rendered-qa-receipt.json'),JSON.stringify(receipt,null,2));console.log('Owned cleanup receipt:',receipt.cleanup);
  }
  assert(receipt.cleanup.complete,'Owned QA resources must close');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={descendants,alive};
