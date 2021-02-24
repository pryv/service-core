

/* global describe, before, after, it, assert, cuid, audit, config, initTests, closeTests, initCore, coreRequest, mongoFixtures */

describe('Audit', function() {
  let userid = cuid();
  let createdBy = cuid();

  let username, access, basePath;

  before(async function() {
    await initTests();
    await initCore();

    const user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      
    });
    username = user.attrs.username;
    basePath = '/' + user.attrs.username + '/events';
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
  });

  after(async function() {
    closeTests();
    await mongoFixtures.clean()
  });

  describe('when making valid API calls', function () {
    let res;
    before(async function () {
      res = await coreRequest
        .get(basePath)
        .set('Authorization', access.token);
      console.log('got', res.body)
    });

    it('must return 200', function () {
      assert.equal(res.status, 200);
    });
    
  });

  describe('when making invalid API calls', function () {
    
  });

});