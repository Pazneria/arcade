// Prepared capture only. Run --capture after the coordinator releases a graphics
// slot. --check-fixtures is CPU-only and never opens a browser or server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createFixtureServer,routeAll,ready,checkFixtureSyntax}=require('./test-directory-browser');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
const {descendants,alive}=require('./test-arcade-rendered');
const root=path.resolve(__dirname,'..'),viewport={width:1707,height:923};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function capture() {
  assert(process.argv.includes('--capture'),'Run --capture only after the coordinator releases the graphics slot.');
  assert(process.env.ARTIFACT_DIR,'ARTIFACT_DIR must identify the owned capture output directory.');
  const output=path.resolve(process.env.ARTIFACT_DIR);fs.mkdirSync(output,{recursive:true});
  const receipt={startedAt:new Date().toISOString(),repository:'Pazneria/arcade',head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),camera:'default-entry-v1',viewport,quality:90,performanceMeasured:false};
  let server,browserServer,browser,browserProcess,context;const owned=new Map();
  try {
    server=createFixtureServer();await withDeadline(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}), 'Capture fixture server');
    receipt.serverPort=server.address().port;const origin='http://127.0.0.1:'+receipt.serverPort;
    const {chromium}=require('playwright');browserServer=await chromium.launchServer({channel:'chrome',headless:true,timeout:15000});
    browserProcess=browserServer.process();receipt.browserPid=browserProcess.pid;
    browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:15000});receipt.browserVersion=browser.version();
    context=await browser.newContext({viewport,deviceScaleFactor:1});const unexpected=[],errors=[];
    await routeAll(context,origin,'normal',unexpected);await context.exposeBinding('__recordArcadeNavigation',()=>{});
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/arcade/',{waitUntil:'domcontentloaded',timeout:15000});await withDeadline(ready(page),'Capture default scene readiness',30000);
    receipt.pose=await page.evaluate(()=>{const controller=window.arcadeTest.controller;controller.pause();controller.reset();controller.__test.freezeElapsed();return {player:{...controller.player},camera:controller.__test.camera(),controller:controller.__test.snapshot(),graphics:controller.__test.graphics()};});
    assert.deepEqual(receipt.pose.player,{x:0,z:-.95,yaw:0,pitch:-.04,eye:1.62,crouch:false});
    const camera=receipt.pose.camera;assert.deepEqual(camera.position,[0,1.62,-.95]);assert.equal(camera.pitch,-.04);assert.equal(camera.yaw,0);assert.equal(camera.order,'YXZ');assert.equal(camera.fov,70);assert.equal(camera.near,.03);assert.equal(camera.far,40);assert.equal(camera.aspect,viewport.width/viewport.height);
    assert.equal(receipt.pose.controller.active,false);assert.equal(receipt.pose.controller.raf,0);assert.equal(await page.locator('#cabinet-game iframe').count(),0);
    descendants(browserProcess.pid).forEach(identity=>owned.set(identity.pid,identity));
    const image=await page.locator('#scene-container canvas').screenshot({path:path.join(output,'arcade-entry.jpg'),type:'jpeg',quality:90,timeout:15000});
    receipt.image={file:'arcade-entry.jpg',destination:'/assets/images/rooms/arcade-entry.jpg',width:viewport.width,height:viewport.height,bytes:image.length,sha256:hash(image),includes:'Current website navigation and reticle, matching the default explore view; no Claude-authored HUD.'};
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);receipt.passed=true;
  }catch(error){receipt.passed=false;receipt.error=error.stack;throw error;}
  finally {
    if(browserProcess)try{descendants(browserProcess.pid).forEach(identity=>owned.set(identity.pid,identity));}catch(error){receipt.ownedProcessCheckError=error.message;}
    if(context)try{await withDeadline(context.close(),'Capture context close');}catch(error){receipt.contextCloseError=error.message;}
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess,server});receipt.endedAt=new Date().toISOString();
    receipt.cleanup.ownedChromeProcesses=[...owned.values()];
    try{receipt.cleanup.remainingOwnedPids=owned.size?alive([...owned.values()]):[];if(receipt.cleanup.remainingOwnedPids.length)receipt.cleanup.complete=false;}catch(error){receipt.cleanup.complete=false;receipt.cleanup.errors.push({step:'Owned Chrome identity check',error:error.message});}
    if(!receipt.cleanup.complete||receipt.contextCloseError||receipt.ownedProcessCheckError)receipt.passed=false;
    fs.writeFileSync(path.join(output,'arcade-entry-capture-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  }
  assert(receipt.passed,'Capture and owned cleanup must complete');console.log('Arcade default-entry-v1 capture and owned cleanup:',receipt);
}
if(require.main===module) {
  if(process.argv.includes('--check-fixtures')){checkFixtureSyntax();assert.deepEqual(viewport,{width:1707,height:923});console.log('Entry capture fixture parsed; no browser/server/GPU started.');}
  else capture().catch(error=>{console.error(error);process.exitCode=1;});
}
