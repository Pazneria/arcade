const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const engineUrl = 'https://unpkg.com/three@0.157.0/build/three.module.js';
// Expose state only in the HTML served by this test, never in the shipped page.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n').replace(
  '        return () => {\n          touchBindings.forEach((remove) => remove());',
  `        window.arcadeTest = {
          cabinets, codexPedestals, focusCabinet, startCabinetLaunch,
          restoreCabinet(index) { writeReturnState(index); applyReturnStateIfPresent(); },
          get active() { return cabinets.indexOf(activeCabinet); },
          get launching() { return !!launchSequence; },
          get guideLecternActive() { return activeCabinet === codexPedestals.find(p => p.userData.anchorCabinet === cabinets[1]); },
          bookPoint() {
            const position=new THREE.Vector3();
            codexPedestals.find(p => p.userData.anchorCabinet === cabinets[1]).userData.bookTargets[0].getWorldPosition(position);
            position.project(camera);
            return {x:(position.x+1)*window.innerWidth/2,y:(1-position.y)*window.innerHeight/2};
          },
          actionPoint(index, action) {
            const button=cabinets[index].userData.actionButtons.find(button=>button.userData.action===action);
            const position=new THREE.Vector3();
            button.getWorldPosition(position);
            position.project(camera);
            return {x:(position.x+1)*window.innerWidth/2,y:(1-position.y)*window.innerHeight/2};
          },
          get renderStats() { return {...renderer.info.render}; },
          focusExit() { focusCabinet(exitDoor.root); },
          get exitActive() { return activeCabinet === exitDoor.root; },
          get signImage() { return exitDoor.signMaterial.map.image.toDataURL(); },
          signBounds() {
            let mesh;
            exitDoor.root.traverse(object => { if (object.material === exitDoor.signMaterial) mesh=object; });
            const box=new THREE.Box3().setFromObject(mesh);
            return [box.min,box.max].map(point => {
              point.project(camera);
              return {x:(point.x+1)*window.innerWidth/2,y:(1-point.y)*window.innerHeight/2};
            });
          },
          arrowPoint(index) {
            const position=new THREE.Vector3();
            exitDoor.switchArrows[index].getWorldPosition(position);
            position.project(camera);
            return {x:(position.x+1)*window.innerWidth/2,y:(1-position.y)*window.innerHeight/2};
          },
          exitPoint() {
            const position = new THREE.Vector3(0, 2.1, 0);
            exitDoor.root.localToWorld(position);
            position.project(camera);
            return {x:(position.x+1)*window.innerWidth/2,y:(1-position.y)*window.innerHeight/2};
          },
          get state() { return {targetZ, touchMove, touchYaw, introDone, look:lookTarget.toArray(), lookError:lookTarget.distanceTo(desiredLookTarget), frames:renderer.info.render.frame}; },
          loseContext() { renderer.forceContextLoss(); },
          cabinetPoint(index) {
            const position = new THREE.Vector3();
            cabinets[index].getWorldPosition(position);
            position.y = 2.4;
            position.project(camera);
            return {x:(position.x+1)*window.innerWidth/2,y:(1-position.y)*window.innerHeight/2};
          },
          clickAction(index, action) {
            hoverCabinet = cabinets[index].userData.actionButtons.find(button => button.userData.action === action);
            onRendererClick();
          }
        };
        return () => {
          touchBindings.forEach((remove) => remove());`
);
assert(html.includes('window.arcadeTest ='), 'Test instrumentation must match the cleanup boundary');
for (const [, asset] of html.matchAll(/thumbnail: '(\.\/assets\/[^']+)'/g)) {
  assert(fs.existsSync(path.join(root, asset)), `Missing cabinet thumbnail: ${asset}`);
}
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.setHeader('Content-Type', 'text/html');
    return res.end(html);
  }
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end();
  }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'image/webp');
  res.end(fs.readFileSync(file));
});

async function assertDirectory(page, failed) {
  assert(await page.locator('#mobile-fallback').isVisible());
  assert.equal(await page.locator('.fallback-card').count(), 5);
  assert.equal(await page.getByRole('link', {name: 'Launch', exact: true}).count(), 3);
  for (const name of ['Ghost Signal', 'Night Courier']) {
    const card = page.locator('.fallback-card').filter({has: page.getByRole('heading', {name, exact: true})});
    assert.match(await card.innerText(), /Coming soon/);
    assert.equal(await card.locator('a').count(), 0);
  }
  assert.equal(await page.locator('a[href*="example.com"], a[href="undefined"]').count(), 0);
  for (const name of ['Home', 'Exit Arcade']) {
    assert.equal(await page.getByRole('link', {name, exact:true}).getAttribute('href'), '/');
  }
  if (failed) assert.match(await page.locator('#directory-message').innerText(), /unavailable/);
  const guide = page.getByRole('link', {name: 'Open OSRS Clone guide (opens in new tab)', exact:true});
  assert(await guide.getAttribute('href'));
  assert.equal(await page.locator('.fallback-card a[aria-label*="guide"]').count(), 3, 'All three confirmed guides appear');
  assert.equal(await page.locator('#cabinet-actions').isVisible(), false, 'Inspection strip must disappear in the directory');
}

const guidePaths = ['/racegpt/wiki/', '/osrs-clone-codex/wiki/', '/sword-guys/wiki/'];
async function visitGuideAndReturn(page, activate, index = 1) {
  await activate();
  await page.waitForURL(`https://pazneria.github.io${guidePaths[index]}**`);
  const destination = new URL(page.url());
  assert.equal(destination.pathname, guidePaths[index]);
  if (index === 1) {
    assert.equal(destination.searchParams.get('from'), 'arcade');
    const returnUrl = destination.searchParams.get('return');
    assert(returnUrl && new URL(returnUrl).hostname === '127.0.0.1');
  }
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.waitForFunction(index => window.arcadeTest?.active === index, index);
  assert.equal(await page.locator('#scene-container canvas').count(), 1);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || undefined,
    headless: true, args: ['--enable-unsafe-swiftshader'],
  });
  try {
    for (const mode of (process.env.TEST_MODE ? [process.env.TEST_MODE] : ['no-webgl', 'no-webgl-mobile', 'renderer-failure', 'import-failure', 'mobile', 'normal'])) {
      const mobile = mode.includes('mobile');
      const context = await browser.newContext({viewport:{width:mobile ? 390 : 1280, height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile ? 3 : 1});
      await context.route('http://127.0.0.1:5178/**', route => route.fulfill({contentType:'text/html',body:'<h1>Local game test destination</h1>'}));
      await context.route('https://pazneria.github.io/osrs-clone-codex/**', route => route.fulfill({contentType:'text/html',body:'<h1>Confirmed guide test destination</h1>'}));
      for (const path of [guidePaths[0],guidePaths[2]]) {
        await context.route(`https://pazneria.github.io${path}**`, route => route.fulfill({contentType:'text/html',body:'<h1>Confirmed game wiki test destination</h1>'}));
      }
      await context.route('https://pazneria.github.io/', route => route.fulfill({contentType:'text/html',body:'<h1>Exit destination test</h1>'}));
      const page = await context.newPage();
      if (process.env.TRACE_NAV) page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log(`${mode} navigation: ${frame.url()}`); });
      const capture = async name => {
        if (!process.env.ARTIFACT_DIR) return;
        fs.mkdirSync(process.env.ARTIFACT_DIR, {recursive:true});
        await page.screenshot({path:path.join(process.env.ARTIFACT_DIR, `${name}.png`)});
      };
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(`${mode}: ${error.stack}`); });
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.route('https://fonts.gstatic.com/**', route => route.abort());
      await page.route(engineUrl, route => {
        if (mode === 'import-failure') return route.abort();
        if (process.env.THREE_MODULE_PATH) return route.fulfill({path:process.env.THREE_MODULE_PATH, contentType:'application/javascript'});
        return route.continue();
      });
      if (mode.startsWith('no-webgl')) {
        await page.addInitScript(() => { window.WebGLRenderingContext = undefined; });
      }
      if (mode === 'renderer-failure') {
        // The probe succeeds, but the renderer cannot get its own context.
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          let probeCanvas;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            if (type.startsWith('webgl') || type === 'experimental-webgl') {
              if (!probeCanvas) probeCanvas = this;
              if (this !== probeCanvas) return null;
            }
            return original.call(this, type, ...args);
          };
        });
      }
      await page.goto(url, {waitUntil:'domcontentloaded'});
      if (mode === 'normal') {
        await page.waitForFunction(() => !!window.arcadeTest);
        assert.equal(await page.locator('#scene-container canvas').count(), 1);
        assert.equal(await page.locator('#mobile-fallback').isVisible(), false);
        await page.waitForFunction(() => window.arcadeTest.state.introDone);
        console.log('Desktop aisle rendering',await page.evaluate(() => window.arcadeTest.renderStats));
        await capture('desktop-room');
        // Resizing must preserve one renderer; opening and closing Games keeps its state.
        for (let i = 0; i < 3; i++) {
          await page.setViewportSize({width:390,height:800});
          await page.getByRole('button',{name:'Games',exact:true}).click();
          await assertDirectory(page, false);
          assert.equal(await page.locator('#scene-container canvas').count(), 1);
          await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).click();
          await page.setViewportSize({width:1280,height:800});
          await page.waitForFunction(() => !document.querySelector('#mobile-fallback').classList.contains('visible'));
          assert.equal(await page.locator('#scene-container canvas').count(), 1);
        }
        for (const index of [3,4]) {
          await page.evaluate(index => window.arcadeTest.restoreCabinet(index), index);
          await page.waitForFunction(index => window.arcadeTest.active === index, index);
          assert.equal(await page.evaluate(index => window.arcadeTest.cabinets[index].userData.actionButtons[0].userData.action, index), 'cabinet-coming-soon');
          await page.evaluate(index => {
            const test = window.arcadeTest;
            test.clickAction(index, 'cabinet-coming-soon');
            // Even a stale URL must not bypass the availability guard.
            test.cabinets[index].userData.game.url = 'https://example.com/stale';
            test.startCabinetLaunch(test.cabinets[index]);
          }, index);
          assert.equal(await page.evaluate(() => window.arcadeTest.launching), false);
          assert.equal(page.url(), url);
          await page.waitForTimeout(500);
          await capture(`coming-soon-${index}`);
          await page.evaluate(index => window.arcadeTest.clickAction(index, 'cabinet-back'), index);
          assert.equal(await page.evaluate(() => window.arcadeTest.active), -1);
        }
        // Available cabinet launch and return state still work across navigation.
        for (let i = 0; i < 2; i++) {
          const previousFrames=await page.evaluate(() => window.arcadeTest.state.frames);
          await page.evaluate(() => window.arcadeTest.restoreCabinet(0));
          await page.waitForFunction(frames => window.arcadeTest.active === 0 && window.arcadeTest.state.frames>frames,previousFrames);
          const playPoint=await page.evaluate(() => window.arcadeTest.actionPoint(0,'cabinet-play'));
          await page.mouse.click(playPoint.x,playPoint.y);
          const returnIndex = await page.evaluate(() => {
            return JSON.parse(sessionStorage.getItem('arcade:return-state:v1')).cabinetIndex;
          });
          assert.equal(returnIndex, 0);
          await page.waitForURL('http://127.0.0.1:5178/');
          await page.goBack({waitUntil:'domcontentloaded'});
          await page.waitForFunction(() => !!window.arcadeTest && window.arcadeTest.active === 0);
          assert.equal(await page.locator('#scene-container canvas').count(), 1);
        }
        for (const index of [0,1,2]) {
          await page.evaluate(index => window.arcadeTest.restoreCabinet(index),index);
          await page.waitForFunction(index => window.arcadeTest.active === index && window.arcadeTest.state.lookError < 0.05,index);
          await page.waitForTimeout(100);
          await capture(`desktop-cabinet-${index}`);
        }
        assert(await page.locator('#cabinet-guide').isVisible(), 'Confirmed Sword Guys guide appears');
        for (const index of [0,2]) {
          await page.evaluate(index => window.arcadeTest.restoreCabinet(index),index);
          await page.waitForFunction(path => {
            const href=document.querySelector('#cabinet-guide').getAttribute('href');
            return href && new URL(href).pathname === path;
          },guidePaths[index]);
          await visitGuideAndReturn(page, () => page.locator('#cabinet-guide').click(), index);
        }
        await page.locator('#cabinet-back').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.arcadeTest.active === -1);
        assert.equal(await page.locator('#cabinet-next').evaluate(e => e === document.activeElement), true, 'Back preserves a useful keyboard focus target');
        await page.locator('#cabinet-previous').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.arcadeTest.active === 1);
        await page.waitForFunction(() => !!document.querySelector('#cabinet-guide').getAttribute('href'));
        await capture('desktop-guide');
        await visitGuideAndReturn(page, async () => {
          await page.locator('#cabinet-guide').focus();
          await page.keyboard.press('Enter');
        });
        await page.locator('#cabinet-guide').focus();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.arcadeTest.active === -1);
        assert.equal(await page.locator('#cabinet-next').evaluate(e => e === document.activeElement), true, 'Escape remains usable from a focused Guide link');
        const guideRestoreFrames=await page.evaluate(() => window.arcadeTest.state.frames);
        await page.evaluate(() => window.arcadeTest.restoreCabinet(1));
        await page.waitForFunction(frames => window.arcadeTest.state.frames > frames, guideRestoreFrames);
        await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
        await visitGuideAndReturn(page, async () => {
          const point = await page.evaluate(() => window.arcadeTest.actionPoint(1,'cabinet-guide'));
          await page.mouse.click(point.x,point.y);
        });
        await page.evaluate(() => window.arcadeTest.focusCabinet(window.arcadeTest.codexPedestals.find(p => p.userData.anchorCabinet === window.arcadeTest.cabinets[1])));
        await page.waitForFunction(() => window.arcadeTest.guideLecternActive && window.arcadeTest.state.lookError < 0.05);
        await visitGuideAndReturn(page, async () => {
          const point = await page.evaluate(() => window.arcadeTest.bookPoint());
          await page.mouse.click(point.x,point.y);
        });
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.arcadeTest.focusExit());
        await page.waitForFunction(() => window.arcadeTest.exitActive && window.arcadeTest.state.lookError < 0.05);
        await page.waitForTimeout(100);
        await capture('desktop-exit');
        const signBounds=await page.evaluate(() => window.arcadeTest.signBounds());
        assert(signBounds.every(point => point.x>0&&point.x<1280&&point.y>0&&point.y<800),'Exit sign must fit completely in the door view');
        for (let i=0;i<4;i++) {
          const previousSign=await page.evaluate(() => window.arcadeTest.signImage);
          const arrowPoint=await page.evaluate(() => window.arcadeTest.arrowPoint(1));
          await page.mouse.move(arrowPoint.x,arrowPoint.y);
          await page.mouse.click(arrowPoint.x,arrowPoint.y);
          assert.notEqual(await page.evaluate(() => window.arcadeTest.signImage),previousSign,'Sign arrow must cycle its design');
          assert.equal(page.url(),url,'Cycling the sign must not exit');
        }
        console.log('Desktop scene budget',await page.evaluate(() => window.arcadeTest.renderStats));
        const exitPoint=await page.evaluate(() => window.arcadeTest.exitPoint());
        await page.mouse.move(exitPoint.x,exitPoint.y);
        await page.mouse.click(exitPoint.x,exitPoint.y);
        await page.waitForURL('https://pazneria.github.io/');
      } else {
        if (mode === 'mobile') {
          await page.waitForFunction(() => window.arcadeTest?.state.introDone);
          assert.equal(await page.locator('#scene-container canvas').count(),1);
          assert(await page.locator('#touch-controls').isVisible());
          console.log('Mobile aisle rendering',await page.evaluate(() => window.arcadeTest.renderStats));
          const cdp = await context.newCDPSession(page);
          const forward = await page.getByRole('button',{name:'Move forward',exact:true}).boundingBox();
          const point = {x:forward.x+forward.width/2,y:forward.y+forward.height/2};
          const startZ = await page.evaluate(() => window.arcadeTest.state.targetZ);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
          await page.waitForTimeout(400);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          assert((await page.evaluate(() => window.arcadeTest.state.targetZ)) < startZ);
          assert.equal(await page.evaluate(() => window.arcadeTest.state.touchMove),0);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          assert.equal(await page.evaluate(() => window.arcadeTest.state.touchMove),0,'Cancelled movement must stop');
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:260}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:260,y:280}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          assert((await page.evaluate(() => window.arcadeTest.state.touchYaw)) < 0);
          assert.equal(await page.evaluate(() => window.arcadeTest.active),-1,'Dragging must not inspect or launch');
          await capture('mobile-aisle');
          await page.getByRole('button',{name:'Next cabinet ›',exact:true}).tap();
          await page.waitForFunction(() => window.arcadeTest.active === 0);
          await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
          assert(await page.locator('#touch-guide').isVisible(), 'Confirmed RaceGPT guide appears');
          await capture('mobile-racegpt');
          await page.getByRole('button',{name:'Back to aisle',exact:true}).tap();
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:250}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:250}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
          const cabinetPoint=await page.evaluate(() => window.arcadeTest.cabinetPoint(0));
          assert(cabinetPoint.x>0&&cabinetPoint.x<390&&cabinetPoint.y>44&&cabinetPoint.y<600);
          await page.touchscreen.tap(cabinetPoint.x,cabinetPoint.y);
          await page.waitForFunction(() => window.arcadeTest.active === 0);
          await visitGuideAndReturn(page, () => page.locator('#touch-guide').tap(), 0);
          for (let i=0;i<4;i++) {
            await page.getByRole('button',{name:'Next cabinet ›',exact:true}).tap();
            await page.waitForFunction(index => window.arcadeTest.active === index,i+1);
            await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
            if(i===0) {
              assert(await page.getByRole('link',{name:'Open OSRS Clone guide',exact:true}).isVisible());
              await capture('mobile-osrs');
              await page.setViewportSize({width:800,height:390});
              await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
              assert(await page.locator('#touch-guide').isVisible());
              const guideBounds=await page.locator('#touch-guide').boundingBox();
              assert(guideBounds.width>=44&&guideBounds.height>=44&&guideBounds.y+guideBounds.height<=390,'Guide remains a usable touch target in landscape');
              await capture('mobile-guide-landscape');
              await page.setViewportSize({width:390,height:800});
              for (let visit=0;visit<2;visit++) {
                await visitGuideAndReturn(page, () => page.locator('#touch-guide').tap());
              }
            }
            if (i===1) await visitGuideAndReturn(page, () => page.locator('#touch-guide').tap(), 2);
          }
          assert(await page.getByRole('button',{name:'Coming soon',exact:true}).isDisabled());
          await capture('mobile-coming-soon');
          for (const size of [{width:800,height:390},{width:390,height:800}]) {
            const previousFrames=await page.evaluate(() => window.arcadeTest.state.frames);
            await page.setViewportSize(size);
            await page.waitForFunction(frames => window.arcadeTest.state.frames > frames+1,previousFrames);
            assert.equal(await page.locator('#scene-container canvas').count(),1);
            assert(await page.locator('#touch-controls').isVisible());
            assert.equal(await page.evaluate(() => window.arcadeTest.active),4);
            await page.waitForFunction(() => window.arcadeTest.state.lookError < 0.05);
            const pixels=await page.locator('#scene-container canvas').evaluate(canvas=>canvas.width*canvas.height);
            assert(pixels<=900000);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),'Controls must fit without horizontal overflow');
            const panel=await page.locator('.touch-panel').boundingBox();
            assert(panel.y>=44&&panel.y+panel.height<=size.height);
            await capture(size.width>size.height?'mobile-landscape':'mobile-portrait');
          }
          await page.getByRole('button',{name:'Back to aisle',exact:true}).tap();
          assert.equal(await page.evaluate(() => window.arcadeTest.active),-1);
          await page.getByRole('button',{name:'Next cabinet ›',exact:true}).tap();
          await page.waitForFunction(() => window.arcadeTest.active === 0);
          for(let i=0;i<2;i++) {
            await page.getByRole('button',{name:'Games',exact:true}).tap();
            await assertDirectory(page,false);
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => window.arcadeTest.active),0,'Directory keyboard input must preserve the inspected cabinet');
            const frames=await page.evaluate(() => window.arcadeTest.state.frames);
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => window.arcadeTest.state.frames),frames,'Directory must pause rendering');
            await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).tap();
            await page.waitForTimeout(100);
            assert.equal(page.url(),url,'Returning from the directory must not click through into a Guide link');
            assert.equal(await page.evaluate(() => window.arcadeTest.active),0);
          }
          for(let i=0;i<2;i++) {
            await page.getByRole('button',{name:'Launch',exact:true}).tap();
            await page.waitForURL('http://127.0.0.1:5178/');
            await page.goBack({waitUntil:'domcontentloaded'});
            await page.waitForFunction(() => window.arcadeTest?.active === 0);
            assert.equal(await page.locator('#scene-container canvas').count(),1);
          }
          await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('link',{name:'Home / Exit',exact:true}).tap()]);
          await page.waitForFunction(() => window.arcadeTest?.state.introDone);
          await page.evaluate(() => window.arcadeTest.loseContext());
          await page.waitForFunction(() => document.querySelector('#directory-message').textContent.includes('unavailable'));
          await assertDirectory(page,true);
          assert.equal(await page.getByRole('button',{name:'Return to 3D arcade',exact:true}).isVisible(),false);
          await capture('mobile-context-lost');
          // Reload restores the capable device after the simulated context loss.
          await page.reload({waitUntil:'domcontentloaded'});
          await page.waitForFunction(() => window.arcadeTest?.state.introDone);
          await page.getByRole('button',{name:'Games',exact:true}).tap();
        }
        await page.waitForFunction(failed => document.querySelector('#mobile-fallback').classList.contains('visible') && (!failed || document.querySelector('#directory-message').textContent.includes('unavailable')), mode !== 'mobile');
        await assertDirectory(page, mode !== 'mobile');
        await capture(mode);
        const firstLaunch = page.getByRole('link', {name:'Launch',exact:true}).first();
        await firstLaunch.focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Open RaceGPT guide (opens in new tab)', 'Tab moves from Launch to that cabinet\'s Guide');
        await firstLaunch.focus();
        await page.setViewportSize({width:400,height:800});
        await page.waitForTimeout(100);
        assert(await firstLaunch.evaluate(element => element === document.activeElement), 'Directory resize must preserve keyboard focus');
        const directoryGuide = page.getByRole('link',{name:'Open OSRS Clone guide (opens in new tab)',exact:true});
        await directoryGuide.focus();
        await page.setViewportSize({width:420,height:800});
        assert(await directoryGuide.evaluate(element => element === document.activeElement), 'Guide focus survives directory resize');
        const guidePopupPromise=page.waitForEvent('popup');
        await page.keyboard.press('Enter');
        const guidePopup=await guidePopupPromise;
        await guidePopup.waitForLoadState('domcontentloaded');
        assert.equal(new URL(guidePopup.url()).pathname, '/osrs-clone-codex/wiki/');
        await guidePopup.close();
        await capture(mode==='mobile'?'mobile-directory-guide':`fallback-guide-${mode}`);
        for (let i = 0; i < 2; i++) {
          const popupPromise = page.waitForEvent('popup');
          await page.locator('.fallback-card').filter({has:page.getByRole('heading', {name:'RaceGPT',exact:true})}).getByRole('link', {name:'Launch',exact:true}).click();
          const popup = await popupPromise;
          await popup.waitForLoadState('domcontentloaded');
          assert.equal(popup.url(), 'http://127.0.0.1:5178/');
          await popup.close();
          await assertDirectory(page, mode !== 'mobile');
        }
        for (const width of [1200,390,1000]) {
          await page.setViewportSize({width,height:800});
          if (mode !== 'mobile') await assertDirectory(page, true);
        }
        if (mode !== 'mobile') {
          // Both plain HTML navigation links work repeatedly after startup failure.
          for (const name of ['Home','Exit Arcade']) {
            await Promise.all([
              page.waitForNavigation({waitUntil:'domcontentloaded'}),
              page.getByRole('link', {name,exact:true}).click(),
            ]);
            await page.waitForFunction(() => document.querySelector('#directory-message').textContent.includes('unavailable'));
            await assertDirectory(page, true);
          }
        }
      }
      assert.deepEqual(errors, [], `${mode}: unhandled browser errors`);
      console.log(`PASS ${mode}`);
      await context.close();
    }
    // Verify the shipped URLs using a published origin rather than the local-dev branch.
    const published = await browser.newContext();
    const page = await published.newPage();
    await page.addInitScript(() => { window.WebGLRenderingContext = undefined; });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://pazneria.github.io/arcade/', route => route.fulfill({contentType:'text/html',body:html}));
    await page.route('https://pazneria.github.io/arcade/codex-link-contract.js', route => route.fulfill({contentType:'application/javascript',path:path.join(root,'codex-link-contract.js')}));
    await page.goto('https://pazneria.github.io/arcade/', {waitUntil:'domcontentloaded'});
    await assertDirectory(page, true);
    for (const [name, pathname] of [['RaceGPT','racegpt'],['OSRS Clone','osrs-clone'],['Sword Guys','sword-guys']]) {
      const launch = page.locator('.fallback-card').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('link',{name:'Launch',exact:true});
      assert.equal(await launch.getAttribute('href'), `https://pazneria.github.io/${pathname}/`);
      const index=['RaceGPT','OSRS Clone','Sword Guys'].indexOf(name);
      const guide=page.getByRole('link',{name:`Open ${name} guide (opens in new tab)`,exact:true});
      assert.equal(new URL(await guide.getAttribute('href')).pathname,guidePaths[index]);
    }
    const codex = new URL(await page.getByRole('link',{name:'Open OSRS Clone guide (opens in new tab)',exact:true}).getAttribute('href'));
    assert.equal(codex.origin + codex.pathname, 'https://pazneria.github.io/osrs-clone-codex/wiki/');
    assert.equal(codex.searchParams.get('return'), 'https://pazneria.github.io/arcade/');
    assert.equal(await page.getByRole('link',{name:'Home',exact:true}).evaluate(link => link.href), 'https://pazneria.github.io/');
    console.log('PASS published destinations and assets');
    await published.close();
    // Hostile values exist only in these served fixtures, never in the registry.
    const security = await browser.newContext();
    const securityPage = await security.newPage();
    await securityPage.addInitScript(() => { window.WebGLRenderingContext = undefined; });
    await securityPage.route('https://fonts.googleapis.com/**', route => route.abort());
    const hostileName = '<img src=x onerror="window.arcadeInjected=true">';
    let securityHtml;
    await securityPage.route(url, route => route.fulfill({contentType:'text/html',body:securityHtml}));
    for (const unsafeUrl of ['javascript:window.arcadeInjected=true', 'data:text/html,<script>alert(1)</script>', 'https://user:pass@example.invalid/wiki/', '/unconfirmed-wiki/']) {
      securityHtml = html
        .replace("name: 'OSRS Clone'", `name: ${JSON.stringify(hostileName)}`)
        .replace(/guideUrl: arcadeCodexLinks[\s\S]*?codexWorldUrl:/, `guideUrl: ${JSON.stringify(unsafeUrl).replaceAll('<', '\\u003c')},\n          codexWorldUrl:`);
      await securityPage.goto(url, {waitUntil:'domcontentloaded'});
      await securityPage.waitForFunction(() => document.querySelectorAll('.fallback-card').length === 5);
      assert.equal(await securityPage.locator('.fallback-card h2').nth(1).innerText(), hostileName, 'Registry text must remain literal text');
      assert.equal(await securityPage.locator('.fallback-card img, .fallback-card script').count(), 0);
      assert.equal(await securityPage.locator('.fallback-card').nth(1).locator('a[aria-label*="guide"]').count(), 0);
      assert.equal(await securityPage.evaluate(() => window.arcadeInjected), undefined);
    }
    await security.close();
    console.log('PASS guide URL safety and literal directory text');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
