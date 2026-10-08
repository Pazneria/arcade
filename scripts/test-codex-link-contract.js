const assert = require('node:assert/strict');
const codexLinks = require('../codex-link-contract.js');
const loadArcadeModules = require('./load-arcade-modules.js');

async function run() {
  assert.equal(
    codexLinks.buildCodexHomeUrl({
      basePath: '/osrs-clone-codex/wiki/',
      baseUrl: 'https://pazneria.github.io',
      from: 'arcade',
      returnTo: 'https://pazneria.github.io/arcade/',
    }),
    'https://pazneria.github.io/osrs-clone-codex/wiki/?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F',
    'Guide must use the published OSRS field guide and preserve return context',
  );
  assert.equal(codexLinks.normalizeCodexRepoName('/osrs-clone-codex/'), 'osrs-clone-codex');
  assert.equal(
    codexLinks.buildCodexHomePath({ repoName: 'osrs-clone-codex', from: 'arcade' }),
    '/osrs-clone-codex/?from=arcade',
  );
  assert.equal(
    codexLinks.buildCodexEntityPath('item', 'bronze_axe', { repoName: 'osrs-clone-codex', from: 'arcade' }),
    '/osrs-clone-codex/items/bronze_axe?from=arcade',
  );
  assert.equal(
    codexLinks.buildCodexEntityUrl('world', 'starter_town', {
      repoName: 'osrs-clone-codex',
      baseUrl: 'https://pazneria.github.io/',
      from: 'arcade',
      returnTo: 'https://pazneria.github.io/arcade/',
    }),
    'https://pazneria.github.io/osrs-clone-codex/world/starter_town?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F',
  );
  assert.equal(
    codexLinks.buildCodexHomeUrl({ repoName: 'osrs-clone-codex', baseUrl: 'https://pazneria.github.io/' }),
    'https://pazneria.github.io/osrs-clone-codex/',
  );
  assert.equal(codexLinks.getCodexRouteTemplates().skill, '/osrs-clone-codex/skills/:skillId');

  const { catalog: { buildArcadeCatalog, PUBLISHED_SITE_ORIGIN } } = await loadArcadeModules();
  const publishedLocation = { hostname: 'pazneria.github.io', href: 'https://pazneria.github.io/arcade/' };
  const games = buildArcadeCatalog(publishedLocation, codexLinks);
  assert.equal(PUBLISHED_SITE_ORIGIN, 'https://pazneria.github.io');
  assert.deepEqual(games.map(({ id, name }) => [id, name]), [
    ['racegpt', 'RaceGPT'], ['osrs-clone', 'OSRS Clone'], ['sword-guys', 'Sword Guys'],
    ['ghost-signal', 'Ghost Signal'], ['night-courier', 'Night Courier'], ['rebound-relay', 'Rebound Relay'],
  ], 'All six cabinet identities and their stored-index order stay intact');
  assert.deepEqual(games.map(({ description }) => description), [
    'Run clean test-track time attacks, chase model ghosts, and try to beat the benchmark board.',
    'Step into a nostalgic low-poly grind with skilling, inventory flow, and classic MMO vibes.',
    'Team up with your blade-slinging crew to carve through waves of neon rivals and claim the arena.',
    'Tune into other realities and banish glitches in a haunted synthwave control room.',
    'Slam through midnight streets delivering impossible payloads before dawn.',
    'Drive your hoverbug, knock the ball into the live gate, and chase clean shots in a 90-second run.',
  ]);
  assert.deepEqual(games.map(({ thumbnail }) => thumbnail), [
    './assets/cabinet-screens/racegpt-title.webp', './assets/cabinet-screens/osrs-clone-title.webp',
    './assets/cabinet-screens/sword-guys-title.webp', './assets/cabinet-screens/ghost-signal-title.webp',
    './assets/cabinet-screens/night-courier-title.webp', './assets/cabinet-screens/rebound-relay-title.webp',
  ]);
  assert.deepEqual(games.map(({ url }) => url), [
    'https://pazneria.github.io/racegpt/', 'https://pazneria.github.io/osrs-clone/',
    'https://pazneria.github.io/sword-guys/', undefined, undefined, 'https://pazneria.github.io/rebound-relay/',
  ]);
  assert.deepEqual(games.map(({ comingSoon }) => Boolean(comingSoon)), [false, false, false, true, true, false]);
  assert.equal(games.filter(({ guideUrl }) => guideUrl).length, 4);
  assert.equal(games[1].codexRepoName, 'osrs-clone-codex');
  assert.equal(games[1].guideUrl,
    'https://pazneria.github.io/osrs-clone-codex/wiki/?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F');
  assert.equal(games[1].codexWorldUrl,
    'https://pazneria.github.io/osrs-clone-codex/world/starter_town?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F');
  for (const index of [3, 4]) {
    assert.equal(games[index].url, undefined);
    assert.equal(games[index].guideUrl, undefined);
  }

  for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]', '']) {
    const href = hostname === '' ? 'file:///arcade/index.html' : 'http://127.0.0.1:5510/?view=games#osrs';
    const local = buildArcadeCatalog({ hostname, href }, codexLinks);
    const expectedHost = hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
    assert.equal(local[0].url, `http://${expectedHost}:5178/`);
    assert.equal(local[2].url, `http://${expectedHost}:5179/`);
    assert.equal(local[1].url, games[1].url);
    assert.equal(local[5].url, games[5].url);
    assert.equal(new URL(local[1].guideUrl).searchParams.get('return'), href);
    assert.equal(new URL(local[1].codexWorldUrl).searchParams.get('return'), href);
  }
  const otherHost = buildArcadeCatalog({ hostname: 'preview.example', href: 'https://preview.example/arcade/' }, codexLinks);
  assert.equal(otherHost[0].url, games[0].url);
  assert.equal(otherHost[2].url, games[2].url);
  const noCodexApi = buildArcadeCatalog(publishedLocation);
  assert.equal(noCodexApi[1].guideUrl, 'https://pazneria.github.io/osrs-clone-codex/wiki/');
  assert.equal(noCodexApi[1].codexWorldUrl, 'https://pazneria.github.io/osrs-clone-codex/world/starter_town');
  assert(Object.isFrozen(games) && games.every(Object.isFrozen), 'Scene placement cannot mutate catalog routes');
  const unsafeCodexApi = {
    buildCodexHomeUrl: () => 'javascript:alert(1)',
    buildCodexEntityUrl: () => 'https://pazneria.github.io/osrs-clone-codex/world/starter_town',
  };
  assert.equal(buildArcadeCatalog(publishedLocation, unsafeCodexApi)[1].guideUrl, null);
  console.log('Arcade catalog and Codex link contract checks passed.');
}

if (require.main === module) {
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
