const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const engineUrl = 'https://unpkg.com/three@0.157.0/build/three.module.js';
// Expose state only in the HTML served by this test, never in the shipped page.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n').replace(
  '        return () => {\n          cancelAnimationFrame(animationFrameId);',
  `        window.arcadeTest = {
          cabinets, focusCabinet, startCabinetLaunch,
          restoreCabinet(index) { writeReturnState(index); applyReturnStateIfPresent(); },
          get active() { return cabinets.indexOf(activeCabinet); },
          get launching() { return !!launchSequence; },
          clickAction(index, action) {
            hoverCabinet = cabinets[index].userData.actionButtons.find(button => button.userData.action === action);
            onRendererClick();
          }
        };
        return () => {
          cancelAnimationFrame(animationFrameId);`
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
  assert(await page.getByRole('link', {name: 'Codex', exact:true}).getAttribute('href'));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || undefined,
    headless: true, args: ['--enable-unsafe-swiftshader'],
  });
  try {
    for (const mode of ['no-webgl', 'renderer-failure', 'import-failure', 'mobile', 'normal']) {
      const context = await browser.newContext({viewport:{width:mode === 'mobile' ? 390 : 1280, height:800}});
      await context.route('http://127.0.0.1:5178/**', route => route.fulfill({contentType:'text/html',body:'<h1>Local game test destination</h1>'}));
      const page = await context.newPage();
      const capture = async name => {
        if (!process.env.ARTIFACT_DIR) return;
        fs.mkdirSync(process.env.ARTIFACT_DIR, {recursive:true});
        await page.screenshot({path:path.join(process.env.ARTIFACT_DIR, `${name}.png`)});
      };
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.route('https://fonts.gstatic.com/**', route => route.abort());
      await page.route(engineUrl, route => {
        if (mode === 'import-failure') return route.abort();
        if (process.env.THREE_MODULE_PATH) return route.fulfill({path:process.env.THREE_MODULE_PATH, contentType:'application/javascript'});
        return route.continue();
      });
      if (mode === 'no-webgl') {
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
        // Repeated layout cleanup/reinitialization must leave one renderer and five cards.
        for (let i = 0; i < 3; i++) {
          await page.setViewportSize({width:390,height:800});
          await page.waitForFunction(() => document.querySelector('#mobile-fallback').classList.contains('visible'));
          await assertDirectory(page, false);
          assert.equal(await page.locator('#scene-container canvas').count(), 0);
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
          await page.evaluate(() => window.arcadeTest.restoreCabinet(0));
          await page.waitForFunction(() => window.arcadeTest.active === 0);
          const returnIndex = await page.evaluate(() => {
            window.arcadeTest.clickAction(0, 'cabinet-play');
            return JSON.parse(sessionStorage.getItem('arcade:return-state:v1')).cabinetIndex;
          });
          assert.equal(returnIndex, 0);
          await page.waitForURL('http://127.0.0.1:5178/');
          await page.goBack({waitUntil:'domcontentloaded'});
          await page.waitForFunction(() => !!window.arcadeTest && window.arcadeTest.active === 0);
          assert.equal(await page.locator('#scene-container canvas').count(), 1);
        }
      } else {
        await page.waitForFunction(failed => document.querySelector('#mobile-fallback').classList.contains('visible') && (!failed || document.querySelector('#directory-message').textContent.includes('unavailable')), mode !== 'mobile');
        await assertDirectory(page, mode !== 'mobile');
        await capture(mode);
        const firstLaunch = page.getByRole('link', {name:'Launch',exact:true}).first();
        await firstLaunch.focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.closest('.fallback-card').querySelector('h2').textContent), 'OSRS Clone');
        await firstLaunch.focus();
        await page.setViewportSize({width:400,height:800});
        await page.waitForTimeout(100);
        assert(await firstLaunch.evaluate(element => element === document.activeElement), 'Directory resize must preserve keyboard focus');
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
    }
    const codex = new URL(await page.getByRole('link',{name:'Codex',exact:true}).getAttribute('href'));
    assert.equal(codex.origin + codex.pathname, 'https://pazneria.github.io/osrs-clone-codex/');
    assert.equal(codex.searchParams.get('return'), 'https://pazneria.github.io/arcade/');
    assert.equal(await page.getByRole('link',{name:'Home',exact:true}).evaluate(link => link.href), 'https://pazneria.github.io/');
    console.log('PASS published destinations and assets');
    await published.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
