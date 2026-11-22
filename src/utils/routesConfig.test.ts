import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_PATHS,
  HEADER_NAV_ITEMS,
  isNavPathActive,
  normalizeAppPath,
  resolveSafeRoute,
} from './routesConfig';

test('HEADER_NAV_ITEMS defines exact 5 pages in order', () => {
  assert.deepEqual(
    HEADER_NAV_ITEMS.map((item) => [item.label, item.path]),
    [
      ['Home', '/'],
      ['Planner', '/planner'],
      ['Crowd Map', '/crowd-map'],
      ['Operator View', '/operator'],
      ['ML Insights', '/ml-insights'],
    ]
  );
});

test('isNavPathActive highlights exact current route without Home false-positives', () => {
  assert.equal(isNavPathActive('/', APP_PATHS.HOME), true);
  assert.equal(isNavPathActive('/planner', APP_PATHS.HOME), false);
  assert.equal(isNavPathActive('/planner', APP_PATHS.PLANNER), true);
  assert.equal(isNavPathActive('/crowd-map/', APP_PATHS.CROWD_MAP), true);
  assert.equal(isNavPathActive('/operator', APP_PATHS.OPERATOR), true);
  assert.equal(isNavPathActive('/ml-insights', APP_PATHS.ML_INSIGHTS), true);
});

test('resolveSafeRoute redirects unknown paths to Home', () => {
  assert.equal(normalizeAppPath('/planner/'), '/planner');
  assert.equal(resolveSafeRoute('/planner'), '/planner');
  assert.equal(resolveSafeRoute('/unknown-page'), '/');
  assert.equal(resolveSafeRoute('/foo/bar'), '/');
});
