# Test Alignment Analysis

## Current State Analysis

### 1. Assertion Libraries (Mixed Usage)

| Component | Primary | Secondary | Modern? |
|-----------|---------|-----------|---------|
| api-server | `should` + `chai.assert` | Mixed | No |
| audit | `chai.assert` | - | Partial |
| business | `should` + `chai.assert` | - | No |
| cache | `chai.assert` | - | Partial |
| hfs-server | `chai.assert` | - | Partial |
| mall | `chai.assert` | - | Partial |
| messages | `chai.assert` | - | Partial |
| metadata | `chai.assert` | - | Partial |
| middleware | `chai.assert` | - | Partial |
| storage | `chai.assert` | - | Partial |
| webhooks | `chai.assert` | - | Partial |

**Findings:**
- **`should`** library used in older tests (extends Object.prototype, BDD style)
- **`chai.assert`** used in most newer tests
- **Node.js built-in `assert`** NOT used (most modern approach)

### 2. Async Patterns

| Pattern | Usage | Files | Modern? |
|---------|-------|-------|---------|
| `async/await` | Primary | ~80% | Yes |
| `async.series()` with callbacks | Legacy | api-server tests | No |
| `.end(function(res) {...})` | Legacy | api-server tests | No |
| Promises with `.then()` | Rare | Few files | Partial |

**Legacy callback pattern example** (api-server/test/profile-app.test.js):
```javascript
before(function (done) {
  async.series([
    testData.resetUsers,
    testData.resetAccesses,
    server.ensureStarted.bind(server, helpers.dependencies.settings),
    function (stepDone) { request = helpers.request(server.url); stepDone(); }
  ], done);
});

it('[FWG1] test', function (done) {
  request.get(path, appAccess.token).end(function (res) {
    validation.check(res, {...}, done);
  });
});
```

**Modern async/await pattern** (audit/test/acceptance/Audit.test.js):
```javascript
before(async function () {
  await initTests();
  await initCore();
  mongoFixtures = getNewFixture();
  user = await mongoFixtures.user(charlatan.Lorem.characters(7), {...});
});

it('[WTNL] test', async function () {
  const res = await coreRequest.get(eventsPath).set('Authorization', token);
  assert.equal(res.status, 200);
});
```

### 3. Server Launch Patterns

**Three distinct patterns found:**

#### Pattern A: InstanceManager with Callbacks (Legacy)
Location: `components/api-server/test/helpers/dependencies.js`
```javascript
const server = helpers.dependencies.instanceManager;
before(function (done) {
  async.series([
    server.ensureStarted.bind(server, helpers.dependencies.settings),
    function (stepDone) { request = helpers.request(server.url); stepDone(); }
  ], done);
});
```
- Used by: Older api-server tests
- Files: ~47 test files in api-server

#### Pattern B: SpawnContext with async/await (Modern)
Location: `components/api-server/test/test-helpers.js`
```javascript
const { SpawnContext } = require('test-helpers').spawner;
const context = new SpawnContext();

before(async function () {
  server = await context.spawn();
});

after(async function () {
  server.stop();
});
```
- Used by: hfs-server, metadata, some api-server tests

#### Pattern C: Global Test Initialization (Most Modern)
Location: Various test-helpers globals
```javascript
/* global initTests, initCore, coreRequest, getNewFixture */

before(async function () {
  await initTests();
  await initCore();
  mongoFixtures = getNewFixture();
});
```
- Used by: audit, cache tests
- Benefits: Global setup, no server management per test file

---

## Recommended Target Pattern

### Assertion Library: Node.js built-in `assert`
```javascript
const assert = require('node:assert');

// Instead of:
const { assert } = require('chai');
res.body.should.eql(expected);

// Use:
assert.deepStrictEqual(res.body, expected);
assert.strictEqual(res.status, 200);
assert.ok(res.body.data);
```

### Async Pattern: async/await everywhere
```javascript
// Instead of:
it('test', function (done) {
  request.get(path).end(function (res) {
    validation.check(res, {...}, done);
  });
});

// Use:
it('test', async function () {
  const res = await coreRequest.get(path).set('Authorization', token);
  assert.strictEqual(res.status, 200);
});
```

### Server Launch: Global Initialization (Pattern C)
```javascript
/* global initTests, initCore, coreRequest, getNewFixture */

before(async function () {
  await initTests();
  await initCore();
  mongoFixtures = getNewFixture();
});
```

---

## Action Items

### Phase 1: Update Test Helpers (Foundational)

1. **[ ] Create unified test-helpers globals**
   - File: `components/test-helpers/src/globals.js`
   - Expose: `initTests`, `initCore`, `coreRequest`, `getNewFixture`, `assert`
   - Make `assert` be Node.js built-in `node:assert`

2. **[ ] Update all test-helpers.js files to use common pattern**
   - `components/api-server/test/test-helpers.js`
   - `components/hfs-server/test/acceptance/test-helpers.js`
   - `components/metadata/test/acceptance/test-helpers.js`
   - `components/business/test/test-helpers.js`
   - `components/webhooks/test/test-helpers.js`

### Phase 2: Migrate api-server Tests (Largest Impact)

3. **[ ] Convert callback-based tests to async/await**
   - Files to migrate: ~47 files in `components/api-server/test/`
   - Replace `async.series([...], done)` with `await` calls
   - Replace `.end(function(res) {...})` with `await request.get(...)`

4. **[ ] Replace InstanceManager pattern with SpawnContext**
   - Remove: `server.ensureStarted.bind(server, settings)`
   - Use: `await context.spawn()` or global `initCore()`

5. **[ ] Replace `should` assertions with `assert`**
   - Replace: `res.body.should.eql(expected)`
   - With: `assert.deepStrictEqual(res.body, expected)`

### Phase 3: Standardize Assertion Library

6. **[ ] Replace chai.assert with node:assert**
   - Search: `require('chai').assert` or `const { assert } = require('chai')`
   - Replace with: `const assert = require('node:assert')`
   - Update assertion methods:
     - `assert.equal()` -> `assert.strictEqual()`
     - `assert.deepEqual()` -> `assert.deepStrictEqual()`
     - `assert.isTrue()` -> `assert.strictEqual(x, true)`
     - `assert.isFalse()` -> `assert.strictEqual(x, false)`
     - `assert.exists()` -> `assert.ok()`
     - `assert.isAbove()` -> `assert.ok(a > b)`
     - `assert.approximately()` -> custom helper or `assert.ok(Math.abs(a-b) < delta)`

7. **[ ] Remove should library**
   - Remove: `require('should')`
   - Replace all `.should.` assertions

### Phase 4: Cleanup

8. **[ ] Remove async library dependency from tests**
   - Package: `async` (used for `async.series`, `async.until`)
   - Replace with native async/await

9. **[ ] Update package.json**
   - Remove dev dependencies: `should`, possibly `chai` (if only used for assert)
   - Keep `sinon` for mocking/spying

---

## Files Requiring Changes

### High Priority (api-server callback-based tests)
```
components/api-server/test/profile-app.test.js
components/api-server/test/access-info.test.js
components/api-server/test/account.test.js
components/api-server/test/accesses.test.js
components/api-server/test/followed-slices.test.js
... (approximately 40+ more files)
```

### Medium Priority (chai.assert -> node:assert)
```
components/audit/test/**/*.test.js
components/business/test/**/*.test.js
components/cache/test/**/*.test.js
components/hfs-server/test/**/*.test.js
components/mall/test/**/*.test.js
components/messages/test/**/*.test.js
components/metadata/test/**/*.test.js
components/middleware/test/**/*.test.js
components/storage/test/**/*.test.js
components/webhooks/test/**/*.test.js
```

### Low Priority (already modern, just assertion library)
```
components/audit/test/acceptance/Audit.test.js (already async/await)
components/cache/test/acceptance/cache.test.js (already async/await)
```

---

## Migration Examples

### Example 1: Convert api-server test (before/after)

**Before:**
```javascript
require('./test-helpers');
const helpers = require('./helpers');
const server = helpers.dependencies.instanceManager;
const async = require('async');

describe('profile', function () {
  before(function (done) {
    async.series([
      testData.resetUsers,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); }
    ], done);
  });

  it('[FWG1] must return profile', function (done) {
    request.get(path, token).end(function (res) {
      res.body.profile.should.eql(expectedData);
      done();
    });
  });
});
```

**After:**
```javascript
/* global initTests, initCore, coreRequest, getNewFixture */
const assert = require('node:assert');

describe('profile', function () {
  before(async function () {
    await initTests();
    await initCore();
    await testData.resetUsers();
  });

  it('[FWG1] must return profile', async function () {
    const res = await coreRequest.get(path).set('Authorization', token);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.profile, expectedData);
  });
});
```

### Example 2: Convert assertion style

**Before (should):**
```javascript
res.body.profile.should.eql(expectedData);
should(value).be.true();
res.status.should.equal(200);
```

**After (node:assert):**
```javascript
assert.deepStrictEqual(res.body.profile, expectedData);
assert.strictEqual(value, true);
assert.strictEqual(res.status, 200);
```

**Before (chai.assert):**
```javascript
const { assert } = require('chai');
assert.equal(res.status, 200);
assert.isTrue(sysLogSpy.calledOnce);
assert.approximately(log.created, now, 0.5);
assert.exists(logs);
```

**After (node:assert):**
```javascript
const assert = require('node:assert');
assert.strictEqual(res.status, 200);
assert.strictEqual(sysLogSpy.calledOnce, true);
assert.ok(Math.abs(log.created - now) < 0.5, 'created timestamp is off');
assert.ok(logs);
```

---

## Estimated Effort

| Phase | Files | Complexity | Estimate |
|-------|-------|------------|----------|
| Phase 1: Test Helpers | 6 | Medium | 2-3 hours |
| Phase 2: api-server | ~47 | High | 2-3 days |
| Phase 3: Assertions | ~50 | Medium | 1-2 days |
| Phase 4: Cleanup | 5 | Low | 1 hour |

**Total: 3-5 days**

---

## Notes

1. Keep `sinon` for spying/mocking - no good built-in alternative
2. Keep `supertest` (if used) or current request helper for HTTP testing
3. The `validation.check()` helper in api-server tests can be simplified with direct assertions
4. Consider running tests in parallel after migration to catch any shared state issues
