const assert = require('node:assert/strict');
const loadArcadeModules = require('./load-arcade-modules.js');

async function run() {
  const { navigation: {
    RETURN_STATE_KEY, RETURN_STATE_MAX_AGE_MS, getSafeGuideUrl, validateReturnState,
    readReturnState, writeReturnState, clearReturnState, navigateAfterDispose,
  } } = await loadArcadeModules();
  assert.equal(RETURN_STATE_KEY, 'arcade:return-state:v1');
  assert.equal(RETURN_STATE_MAX_AGE_MS, 3600000);
  const now = 10000000;
  const options = { now, cabinetCount: 6 };
  const state = { cabinetIndex: 5, savedAt: now - 1000 };
  assert.deepEqual(validateReturnState(state, options), state, 'Existing Rebound Relay index restores');
  assert.deepEqual(validateReturnState({ cabinetIndex: 0, savedAt: now - RETURN_STATE_MAX_AGE_MS }, options),
    { cabinetIndex: 0, savedAt: now - RETURN_STATE_MAX_AGE_MS }, 'One-hour boundary is compatible');
  for (const invalid of [
    null, [], {}, { ...state, cabinetIndex: '1' }, { ...state, cabinetIndex: 1.5 },
    { ...state, cabinetIndex: -1 }, { ...state, cabinetIndex: 6 }, { ...state, cabinetIndex: Infinity },
    { ...state, savedAt: '10000000' }, { ...state, savedAt: NaN }, { ...state, savedAt: Infinity },
    { ...state, savedAt: now + 1 }, { ...state, savedAt: now - RETURN_STATE_MAX_AGE_MS - 1 },
  ]) assert.equal(validateReturnState(invalid, options), null);
  assert.equal(validateReturnState(state, { now: NaN }), null);
  assert.equal(validateReturnState(state, { now, cabinetCount: -1 }), null);
  assert.equal(validateReturnState(state, { now, cabinetCount: 5.5 }), null);
  assert.equal(validateReturnState({ cabinetIndex: 0, savedAt: now }, { now, cabinetCount: 0 }), null);
  assert.deepEqual(validateReturnState({ ...state, extra: 'ignored' }, options), state);

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  assert.equal(readReturnState(storage, options), null);
  values.set(RETURN_STATE_KEY, JSON.stringify(state));
  assert.deepEqual(readReturnState(storage, options), state, 'Legacy stored state is readable');
  values.set(RETURN_STATE_KEY, '{malformed');
  assert.equal(readReturnState(storage, options), null);
  assert.equal(writeReturnState(storage, 2, options), true);
  assert.deepEqual(JSON.parse(values.get(RETURN_STATE_KEY)), { cabinetIndex: 2, savedAt: now });
  assert.deepEqual(readReturnState(storage, options), { cabinetIndex: 2, savedAt: now });
  assert.equal(writeReturnState(storage, 6, options), false);
  assert.equal(writeReturnState(storage, -1, options), false);
  assert.deepEqual(readReturnState(storage, options), { cabinetIndex: 2, savedAt: now }, 'Rejected writes leave prior state intact');
  assert.equal(clearReturnState(storage), true);
  assert.equal(readReturnState(storage, options), null);
  const unavailable = {
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); },
    removeItem() { throw new Error('Storage unavailable'); },
  };
  assert.equal(readReturnState(unavailable, options), null);
  assert.equal(writeReturnState(unavailable, 2, options), false);
  assert.equal(clearReturnState(unavailable), false);
  assert.equal(readReturnState(null, options), null);
  assert.equal(writeReturnState(null, 2, options), false);
  assert.equal(clearReturnState(null), false);

  assert.equal(getSafeGuideUrl('https://pazneria.github.io/racegpt/wiki/'), 'https://pazneria.github.io/racegpt/wiki/');
  assert.equal(getSafeGuideUrl('https://pazneria.github.io/wiki/?from=arcade&return=https%3A%2F%2Fexample.com'),
    'https://pazneria.github.io/wiki/?from=arcade&return=https%3A%2F%2Fexample.com');
  for (const unsafe of [undefined, null, {}, '', ' ', '/wiki/', '//pazneria.github.io/wiki/',
    'javascript:alert(1)', 'data:text/html,hello', 'http://pazneria.github.io/wiki/',
    'https://user@pazneria.github.io/wiki/', 'https://user:password@pazneria.github.io/wiki/', 'invalid URL']) {
    assert.equal(getSafeGuideUrl(unsafe), null);
  }

  const events = [];
  const target = 'http://localhost:5178/';
  assert.equal(await navigateAfterDispose(target, {
    dispose() { events.push('dispose'); },
    navigate(url) { events.push(['navigate', url]); return 'navigated'; },
  }), 'navigated');
  assert.deepEqual(events, ['dispose', ['navigate', target]]);
  const asyncEvents = [];
  let completeDisposal;
  const disposal = new Promise((resolve) => { completeDisposal = resolve; });
  const pendingNavigation = navigateAfterDispose('/', {
    dispose() { asyncEvents.push('dispose'); return disposal; },
    navigate(url) { asyncEvents.push(['navigate', url]); },
  });
  assert.deepEqual(asyncEvents, ['dispose'], 'Async cleanup must finish before navigation');
  completeDisposal();
  await pendingNavigation;
  assert.deepEqual(asyncEvents, ['dispose', ['navigate', '/']]);
  let navigatedAfterFailure = false;
  await assert.rejects(navigateAfterDispose(target, {
    dispose() { throw new Error('Cleanup failed'); },
    navigate() { navigatedAfterFailure = true; },
  }), /Cleanup failed/);
  assert.equal(navigatedAfterFailure, false);
  await assert.rejects(navigateAfterDispose('', { dispose() {}, navigate() {} }), TypeError);
  await assert.rejects(navigateAfterDispose(target, {}), TypeError);
  console.log('Arcade return-state, Guide safety, and disposal-order checks passed.');
}

if (require.main === module) {
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
