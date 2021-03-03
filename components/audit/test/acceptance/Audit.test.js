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

  let user, username, access, readAccess;
  let eventsPath;
  let auditStorage;
  
  before(async function() {
    await initTests();
    await initCore();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {});

    username = user.attrs.username;
    await user.stream({id: 'yo', name: 'YO'});
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    access = access.attrs;
    await user.session(access.token);
    readAccess = await user.access({
      type: 'app',
      token: cuid(),
      permissions: [{streamId: 'yo', level: 'read'}],
    });
    readAccess = readAccess.attrs;
    user = user.attrs;
    auditStorage = audit.storage.forUser(user.id);
    eventsPath = '/' + username + '/events/';
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
        .get(eventsPath)
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
    describe('with errorId "invalid-request-structure"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .get(eventsPath)
          .set('Authorization', access.token)
          .query({ streams: JSON.stringify({ any:  ['A', 'Z', true] }) }); // copied from 30NV
      });
      it('must return 400', function() {
        assert.equal(res.status, 400);
      });
      it('must log it into the database', function() {
        const entries = auditStorage.getLogs({ fromTime: now });
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-request-structure');
      })
    });
    describe('with errorId "invalid-parameters-format"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .get(eventsPath)
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
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-parameters-format');
      })
    });
    describe('with errorId "unknown-referenced-resource"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .get(eventsPath)
          .set('Authorization', access.token)
          .query({
            streams: ['does-not-exist']
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
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'unknown-referenced-resource');
      })
    });
    describe('with errorId "invalid-access-token"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .get(eventsPath)
          .set('Authorization', 'invalid-token')
      });
      it('must return 403', function() {
        assert.equal(res.status, 403);
      });
      it('must log it into the database', function() {
        const entries = auditStorage.getLogs({ fromTime: now });
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-access-token');
      })
    });
    describe('with errorId "forbidden"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .post(eventsPath)
          .set('Authorization', readAccess.token)
          .send({
            streamIds: ['yo'],
            type: 'note/txt',
            content: 'yo'
          })
      });
      it('must return 403', function() {
        assert.equal(res.status, 403);
      });
      it('must log it into the database', function() {
        const entries = auditStorage.getLogs({ fromTime: now });
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'forbidden');
      })
    });
    describe('with errorId "unknown-resource"', function() {
      before(async function() {
        now = Date.now() / 1000;
        res = await coreRequest
          .post(eventsPath + 'does-not-exist')
          .set('Authorization', access.token)
      });
      it('must return 404', function() {
        assert.equal(res.status, 404);
      });
      it('must log it into the database', function() {
        const entries = auditStorage.getLogs({ fromTime: now });
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'unknown-resource');
      })
    });
    
  });

});