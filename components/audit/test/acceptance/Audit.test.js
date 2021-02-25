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
    auditStorage = audit.storage.forUser(user.id);
  });

  after(async function() {
    closeTests();
    await mongoFixtures.clean()
  });

  describe('when making valid API calls', function () {
    let res, now;
    before(async function () {
      now = Date.now() / 1000;
      res = await coreRequest
        .get(basePath)
        .set('Authorization', access.token);
    });

    it('must return 200', function () {
      assert.equal(res.status, 200);
    });
    it('must log it into the database', function () {
      const entries = auditStorage.getLogs();
      assert.exists(entries);
      assert.equal(entries.length, 1);
      const log = entries[0];
      assert.equal(log.streamIds[0], access.id, 'stream Id of audit log is not access Id');
      assert.equal(log.content.source.name, 'http', 'source name is wrong');
      assert.equal(log.content.action, 'events.get', 'action is wrong');
      assert.approximately(log.created, now, 0.5, 'created timestamp is off');
      assert.approximately(log.modified, now, 0.5, 'modified timestamp is off');
    });
    
  });

  describe('when making invalid API calls', function() {
    let res, now;
    describe('invalid-request-structure', function() {
    });
    describe('invalid-parameters-format', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .get(basePath)
          .set('Authorization', access.token)
          .query({
            fromTime: 'yo'
          });
        
      });
      it('must return 400', function() {
        assert.equal(res.status, 400);
      });
      it('must log it into the database', function() {
        const entries = auditStorage.getLogs({ fromTime: now });
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.equal()
      })
    });
    describe('unknown-referenced-resourc', function() {
    });
    describe('invalid-access-token', function() {
    });
    describe('forbidden', function() {
    });
    describe('unknown-resource', function() {
    });
    
  });

});