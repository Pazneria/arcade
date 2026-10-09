// Targeted rendered integration review. Requires an explicit coordinated slot.
// One headless browser, ephemeral context, intercepted local source GETs, no
// HTTP server, no existing profile, no publication, and no score/network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {instrumentApp,instrumentController,ready,checkFixtureSyntax}=require('./test-directory-browser');
const {withDeadline,closeOwnedQA}=require('./arcade-qa-lifecycle');
const root=path.resolve(__dirname,'..'),site='https://pazneria.github.io';
const out=path.resolve(process.env.ARCADE_REVIEW_OUTPUT||path.join(root,'..','cabinet-rendered-review'));
const nativeRoot=process.env.ARCADE_RACEGPT_DIST||path.join(root,'..','racegpt-cabinet-bridge','dist');
const playwrightRoot=process.env.ARCADE_PLAYWRIGHT_DIR||'C:/Users/jmore/Documents/Codex/2026-10-08/task-15/arcade-derivative/node_modules/playwright';
const receipt={kind:'targeted integration review; no benchmark or holistic arrival claim',graphicsRun:false,startedAt:new Date().toISOString(),sourceCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),nativeRoot,nativeCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:path.dirname(nativeRoot),encoding:'utf8'}).trim(),events:[],errors:[],consoleMessages:[],blocked:[],screenshots:[],cleanup:null};
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const mime=file=>({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream';
function asset(base,relative){const file=path.resolve(base,relative);return file.startsWith(path.resolve(base)+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?file:null;}
async function run(){
  checkFixtureSyntax();
  if(process.argv.includes('--check-fixtures'))return;
  assert.equal(process.env.ARCADE_GRAPHICS_SLOT,'parent-approved','Obtain a coordinated bounded graphics slot from the parent first.');
  assert(fs.existsSync(path.join(nativeRoot,'index.html')),'Native RaceGPT review build must exist; do not install or build implicitly.');
  fs.mkdirSync(out,{recursive:true});
  const {chromium}=require(playwrightRoot);let browserServer,browser,context,page,gate=null;
  const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file,timeout:15000});receipt.screenshots.push(file);};
  const phase=()=>page.evaluate(()=>window.arcadeTest.state.mode);
  try{
    receipt.graphicsRun=true;browserServer=await chromium.launchServer({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});receipt.browserPid=browserServer.process().pid;
    browser=await chromium.connect(browserServer.wsEndpoint());receipt.browserVersion=browser.version();
    context=await browser.newContext({viewport:{width:1707,height:923},deviceScaleFactor:1,serviceWorkers:'block'});
    await context.addInitScript(()=>{
      window.__cabinetReviewGL=[];window.__cabinetReviewContext=[];
      document.addEventListener('webglcontextlost',event=>window.__cabinetReviewContext.push({type:'lost',time:performance.now(),status:event.statusMessage}),true);
      document.addEventListener('webglcontextrestored',()=>window.__cabinetReviewContext.push({type:'restored',time:performance.now()}),true);
      for(const api of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(api){
        const link=api.prototype.linkProgram;
        api.prototype.linkProgram=function(program){link.call(this,program);window.__cabinetReviewGL.push({linked:this.getProgramParameter(program,this.LINK_STATUS),valid:this.isProgram(program),contextLost:this.isContextLost(),log:this.getProgramInfoLog(program)});};
      }
    });
    await context.exposeBinding('__recordArcadeNavigation',(_,record)=>receipt.events.push({navigation:record}));
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!['GET','HEAD'].includes(req.method())){receipt.blocked.push({url:url.href,method:req.method()});return route.abort('blockedbyclient');}
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
      if(url.origin===site&&url.pathname.startsWith('/arcade/')){
        const relative=decodeURIComponent(url.pathname.slice(8))||'index.html',file=asset(root,relative);if(!file)return route.fulfill({status:404,body:'Missing owned asset'});
        let body=fs.readFileSync(file);if(relative==='assets/arcade-app.js')body=Buffer.from(instrumentApp(read(file)));if(relative==='assets/arcade-controller.js')body=Buffer.from(instrumentController(read(file)));
        return route.fulfill({contentType:mime(file),body});
      }
      if(url.origin===site&&url.pathname.startsWith('/racegpt/')){
        if(gate&&url.pathname==='/racegpt/'){const held=gate;held.requested=true;await held.promise;}
        const file=asset(nativeRoot,decodeURIComponent(url.pathname.slice(9))||'index.html');return file?route.fulfill({contentType:mime(file),body:fs.readFileSync(file)}):route.fulfill({status:404,body:'Missing native review asset'});
      }
      receipt.blocked.push({url:url.href,method:req.method()});return route.abort('blockedbyclient');
    });
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>receipt.errors.push(error.message));page.on('console',message=>receipt.consoleMessages.push({type:message.type(),text:message.text().slice(0,5000)}));
    async function validateGraphics(label){
      const graphics=await page.evaluate(()=>({current:window.arcadeTest.controller.__test.graphics(),links:window.__cabinetReviewGL,contextEvents:window.__cabinetReviewContext}));receipt[label]=graphics;
      if(graphics.current.contextLost)throw new Error(label+': WebGL context lost; shader validity and pixels unavailable');
      assert(graphics.links.length>0,label+': no compiled programs');
      if(graphics.links.some(p=>p.linked==null||!p.valid))throw new Error(label+': WebGL link query unavailable; this does not establish a shader compilation failure');
      assert(graphics.links.every(p=>p.linked===true),label+': actual WebGL program link failure; see saved logs');
    }
    async function checks(){
      await page.goto(site+'/arcade/',{waitUntil:'domcontentloaded'});await withDeadline(ready(page),'Arcade ready',30000);
      await validateGraphics('hostGraphics');
      // Targeted approach fixture, followed by the real E/ray selection path.
      await page.evaluate(()=>window.arcadeTest.controller.__test.faceAnchor('game-0'));
      const aisle=await page.evaluate(()=>({...window.arcadeTest.controller.player}));await page.keyboard.press('e');
      await page.waitForFunction(()=>window.arcadeTest.state.mode==='inspect');
      const camera=await page.evaluate(()=>window.arcadeTest.controller.__test.camera());assert.deepEqual(camera.position,[aisle.x,aisle.eye,aisle.z]);assert.equal(camera.fov,70);
      assert.equal(await page.locator('#cabinet-actions').getAttribute('data-screen-projected'),'true');await shot('01-standing-physical-menu');
      await page.keyboard.press('ArrowRight');await page.locator('#cabinet-hotspots [data-action="technical-bowl"]').click();
      assert.equal(await page.locator('#cabinet-hotspots [data-action="technical-bowl"]').getAttribute('aria-pressed'),'true');await shot('02-selected-track');
      let release;gate={promise:new Promise(resolve=>release=resolve),release,requested:false};
      await page.locator('#cabinet-hotspots [data-action="start"]').click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='inserting');
      await page.waitForTimeout(160);await shot('03-token-in-standing-view');assert.equal(await page.locator('#game-frame iframe').evaluate(f=>f.inert),true);
      await validateGraphics('tokenGraphics');
      await page.waitForFunction(()=>document.getElementById('cabinet-lifecycle-status').textContent.includes('taking longer'),{},{timeout:15000});await shot('04-delayed-document');
      await page.keyboard.press('Escape');assert.equal(await phase(),'explore');assert.equal(await page.locator('#game-frame iframe').count(),0);gate.release();gate=null;
      await page.waitForTimeout(120);assert.equal(await phase(),'explore');
      await page.locator('#open-games').click();await page.getByRole('button',{name:'View RaceGPT cabinet',exact:true}).click();
      await page.locator('#cabinet-hotspots [data-action="technical-bowl"]').click();await page.locator('#cabinet-hotspots [data-action="start"]').click();
      await page.waitForFunction(()=>window.arcadeTest.state.mode==='play',{},{timeout:30000});assert.equal(await page.locator('#game-frame iframe').count(),1);
      assert.equal(new URL(await page.locator('#game-frame iframe').getAttribute('src')).searchParams.get('track'),'technical-bowl');
      const game=page.frames().find(f=>f.url().startsWith(site+'/racegpt/'));assert(game);
      assert.equal(new URL(game.url()).searchParams.get('arcadeStart'),'1');
      await game.waitForFunction(()=>['countdown','running'].includes(window.__raceGptDebug?.mode));
      assert.equal(await game.locator('#start-button').isVisible(),false,'Cabinet Start goes straight to the selected native run');
      await game.waitForFunction(()=>window.__raceGptDebug?.mode==='running',{},{timeout:20000});
      const nativeBefore=await game.evaluate(()=>window.__raceGptDebug),inputs=[];
      const stopped=await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount);
      for(const [key,ms] of [['w',4500],['a',1500],['w',4500],['d',1500]]){await page.keyboard.down(key);try{await page.waitForTimeout(ms);inputs.push({key,debug:await game.evaluate(()=>window.__raceGptDebug)});}finally{await page.keyboard.up(key);}}
      assert(inputs.some(p=>p.key==='w'&&p.debug.input.throttle===1));assert(inputs.some(p=>p.key==='a'&&p.debug.input.steer>0));assert(inputs.some(p=>p.key==='d'&&p.debug.input.steer<0));
      assert(inputs.some(p=>p.debug.speedKmh>1),'Native keyboard input moves the real car');receipt.nativeInput={before:nativeBefore,samples:inputs};
      assert.equal(await page.evaluate(()=>window.arcadeTest.controller.__test.snapshot().renderCount),stopped,'Host renderer stays paused during native play');await shot('05-native-track-play');
      await page.locator('#game-frame iframe').evaluate(f=>f.dataset.reviewIdentity='one-document');
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(180);assert.equal(await page.locator('#game-frame iframe').getAttribute('data-review-identity'),'one-document');await shot('06-narrow-play-viewport');
      await page.setViewportSize({width:1707,height:923});await page.locator('#game-expand').click();assert.equal(await page.locator('#game-frame iframe').getAttribute('data-review-identity'),'one-document');await shot('07-fit-same-game-to-cabinet');
      await page.locator('#game-back').click();await page.waitForFunction(()=>window.arcadeTest.state.mode==='explore');assert.equal(await page.locator('#game-frame iframe').count(),0);
      assert.equal(await page.evaluate(()=>window.arcadeTest.controller.active),true);
      receipt.events.push({standingCamera:camera,cancelAndLateLoad:true,nativeTrack:'technical-bowl',nativeInputSeconds:12,resizeRetainsDocument:true,returnRemovesFrame:true});
      await page.locator('#open-games').click();await page.getByRole('button',{name:'View Sword Guys cabinet',exact:true}).click();await shot('08-generic-physical-menu');
      await page.keyboard.press('Escape');await page.locator('#open-games').click();await page.getByRole('button',{name:'View Ghost Signal cabinet',exact:true}).click();assert(await page.locator('#coming-soon').isVisible());await shot('09-coming-soon-cabinet');await page.keyboard.press('Escape');
      assert.deepEqual(receipt.errors,[]);receipt.passed=true;
    }
    await withDeadline(checks(),'Bounded integration review',150000);
  }catch(error){receipt.passed=false;receipt.error=error.stack;throw error;}
  finally{
    gate?.release();if(context)await withDeadline(context.close(),'Owned context close',10000).catch(error=>receipt.errors.push(error.message));
    receipt.cleanup=await closeOwnedQA({browser,browserServer,browserProcess:browserServer?.process(),timeoutMs:10000});receipt.endedAt=new Date().toISOString();
    if(!receipt.cleanup.complete)receipt.passed=false;
    fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  }
  assert(receipt.cleanup.complete);console.log(JSON.stringify({passed:receipt.passed,receipt:path.join(out,'receipt.json'),cleanup:receipt.cleanup}));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
