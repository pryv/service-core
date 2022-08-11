/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { safetyCleanDuplicate } = require('platform/src/service_register');
const assert = require('chai').assert;

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
    }

    const res = safetyCleanDuplicate(foundDuplicates, null, params);
    assert.exists(res.email);
    assert.exists(res.username);
    assert.isUndefined(res.extra);
    done();
  });
});