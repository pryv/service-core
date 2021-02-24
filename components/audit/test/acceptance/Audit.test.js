/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


/* global describe, before, after, it, assert, cuid, audit, config, initTests, closeTests, initCore, coreRequest, mongoFixtures */

describe('Audit', function() {
  let userid = cuid();
  let createdBy = cuid();

  let user, username, access, basePath;
  let auditStorage;

  before(async function() {
    await initTests();
    await initCore();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {});

    username = user.attrs.username;
    basePath = '/' + username + '/events';
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
    user = user.attrs;
    console.log('created', user);
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
      //console.log('got', res.body)
    });

    it('must return 200', function () {
      assert.equal(res.status, 200);
    });
    it('must log it into the database', function () {
      auditStorage = audit.storage.forUser(user.id);
      const entries = auditStorage.getLogs({createdBy: createdBy});
      console.log('got', entries);
      assert.exists(entries);
    });
    
  });

  describe('when making invalid API calls', function () {
    
  });

});