/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const { safetyCleanDuplicate } = require('platform/src/service_register');
const assert = require('node:assert');

describe('Service Register Errors', function () {
  it('[LPD4] Should remove not matching params from duplicate Error', (done) => {
    const foundDuplicates = {
      email: 'toto',
      username: 'toto',
      extra: 'bob'
    };
    const params = {
      email: 'toto',
      extra: 'bib',
      username: 'toto'
    };

    const res = safetyCleanDuplicate(foundDuplicates, null, params);
    assert.ok(res.email != null);
    assert.ok(res.username != null);
    assert.strictEqual(res.extra, undefined);
    done();
  });
});
