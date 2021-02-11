const ServiceRegister = require('business/src/auth/service_register');
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

    const res = ServiceRegister.safetyCleanDuplicate(foundDuplicates, null, params);
    assert.exists(res.email);
    assert.exists(res.username);
    assert.isUndefined(res.extra);
    done();
  });
});