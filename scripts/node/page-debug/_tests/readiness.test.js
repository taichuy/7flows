const test = require('node:test');
const assert = require('node:assert/strict');

const { assertReadyNavigation } = require('../readiness.js');

test('assertReadyNavigation rejects sign-in fallback', () => {
  assert.throws(
    () =>
      assertReadyNavigation({
        requestedUrl: '/settings',
        finalUrl: 'http://127.0.0.1:3100/sign-in',
        waitForUrl: null,
      }),
    /sign-in/u
  );
});

test('assertReadyNavigation honors explicit wait-for-url', () => {
  assert.deepEqual(
    assertReadyNavigation({
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      waitForUrl: 'http://127.0.0.1:3100/settings/members',
    }),
    {
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      readyState: 'ready_with_url',
    }
  );
});
