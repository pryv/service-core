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

  let user, username, password, access, readAccess;
  let eventsPath, auditPath;
  let auditStorage;

  const SYSLOG_METHOD = 'eventForUser';
  const STORAGE_METHOD = 'forUser';

  let sysLogSpy, storageSpy;
  
  before(async function() {
    await initTests();
    await initCore();
    password = cuid();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password: password,
    });
    sysLogSpy = sinon.spy(audit.syslog, SYSLOG_METHOD);
    storageSpy = sinon.spy(audit.storage, STORAGE_METHOD);

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
    auditPath =  '/' + username + '/audit/logs/';
  });

  function createUserPath(suffixPath) {
    return path.join('/', username, suffixPath);
  }

  function resetSpies() {
    sysLogSpy.resetHistory();
    storageSpy.resetHistory();
  }

  after(async function() {
    closeTests();
    await mongoFixtures.clean();
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
    it('must return logs when queried', async function() {
      res = await coreRequest
        .get(auditPath)
        .set('Authorization', access.token);
      assert.equal(res.status, 200);
      const logs = res.body.auditLogs;
      assert.exists(logs);
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.streamIds[0], access.id, 'stream Id of audit log is not access Id');
      assert.equal(log.content.source.name, 'http', 'source name is wrong');
      assert.equal(log.content.action, 'events.get', 'action is wrong');
      assert.approximately(log.created, now, 0.5, 'created timestamp is off');
      assert.approximately(log.modified, now, 0.5, 'modified timestamp is off');
    });

    describe('when making a call that is not audited', function() {
      before(async function () {
        assert.isUndefined(apiMethods.AUDITED_METHODS_MAP['service.info']);
        resetSpies();
        now = Date.now() / 1000;
        res = await coreRequest
          .get(createUserPath('/service/info'));
      });
  
      it('must return 200', function () {
        assert.equal(res.status, 200);
      });
      it('must not log it in syslog', function() {
        assert.isFalse(sysLogSpy.calledOnce);
      });
      it('must not save it to storage', function() {
        assert.isFalse(storageSpy.calledOnce);
      });
    });
    describe('when making a call that has its own custom accessId', function() {
      let log;
      before(async function () {
        resetSpies();
        now = Date.now() / 1000;
        res = await coreRequest
          .post(createUserPath('/auth/login'))
          .set('Origin', 'https://sw.rec.la')
          .send({
            username: username,
            password: password,
            appId: 'whatever',
          });
      });
  
      it('must return 200', function () {
        assert.equal(res.status, 200);
      });
      it('must log it in syslog', function() {
        assert.isTrue(sysLogSpy.calledOnce);
      });
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        log = entries[0];
      });
      it('must have its custom accessId save to streamIds', function() {
        assert.include(log.streamIds, MethodContextUtils.AuditAccessIds.VALID_PASSWORD);
      });
    });
    describe('when making a call that has no userId', function() {
      let log;
      before(async function () {
        resetSpies();
        now = Date.now() / 1000;
        res = await coreRequest
          .post('/users')
          .send({
            username: cuid().substring(2, 26),
            password: cuid(),
            appId: 'whatever',
            email: cuid(),
            insurancenumber: '123'
          });
      });
  
      it('must return 201', function () {
        assert.equal(res.status, 201);
        
      });
      it('must log it in syslog', function() {
        assert.isTrue(sysLogSpy.calledOnce);
      });
      it('must not log it to storage', async function() {
        assert.isFalse(storageSpy.calledOnce);
      });
    });
    
  });

  describe('when making invalid API calls', function() {
    let res, now;
    describe('for an unknown user', function() {
      before(async function() {
        resetSpies();
        now = Date.now() / 1000;
        res = await coreRequest
          .get('/unknown-username/events/')
          .set('Authorization', 'doesnt-matter')
      });
      it('must return 400', function() {
        assert.equal(res.status, 404);
      });
      it('must not log it in syslog', function() {
        assert.isFalse(sysLogSpy.calledOnce);
      });
      it('must not save it to storage', function () {
        assert.isFalse(storageSpy.calledOnce);
      });
    });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-request-structure');
      });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-parameters-format');
      });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'unknown-referenced-resource');
      });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'invalid-access-token');
      });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'forbidden');
      });
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
      it('must return logs when queried', async function() {
        res = await coreRequest
          .get(auditPath)
          .set('Authorization', access.token)
          .query({ fromTime: now });
        assert.equal(res.status, 200);
        const entries = res.body.auditLogs;
        assert.exists(entries);
        assert.equal(entries.length, 1);
        const log = entries[0];
        assert.exists(log.content.error)
        assert.equal(log.content.error.id, 'unknown-resource');
      });
    });
    
  });

  describe('Filtering', function() {

    describe('when filtering by calledMethods', function() {
      after(async function() {
        config.injectTestConfig({});
        await audit.reloadConfig();
      })
      describe('when allowing all', function() {
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { allowed: ['all'], unallowed: [] }}},
            storage: { filter: { methods: { allowed: ['all'], unallowed: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('must log it in syslog', function() {
          const numAudited = apiMethods.AUDITED_METHODS.length;
          assert.equal(sysLogSpy.callCount, numAudited);
        });
        it('must save it to storage', function() {
          const numStored = apiMethods.AUDITED_METHODS.length - apiMethods.WITHOUT_USER_METHODS.length;
          assert.equal(storageSpy.callCount, numStored);
        });
        
      });
      describe('when allowing all, but a few', function () {
        const unallowed = ['events.get', 'auth.register', 'streams.create'];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { allowed: [], unallowed: unallowed }}},
            storage: { filter: { methods: { allowed: [], unallowed: unallowed }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('must log it in syslog', function() {
          const logged = apiMethods.AUDITED_METHODS.filter(m => ! unallowed.includes(m));
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('must save it to storage', function() {
          const stored = apiMethods.AUDITED_METHODS
            .filter(m => ! apiMethods.WITHOUT_USER_METHODS.includes(m))
            .filter(m => ! unallowed.includes(m));
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when only allowing a few', function () {
        const allowed = ['events.get', 'auth.register', 'streams.create'];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { allowed, unallowed: [] }}},
            storage: { filter: { methods: { allowed, unallowed: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('must log it in syslog', function() {
          const logged = apiMethods.AUDITED_METHODS.filter(m => allowed.includes(m));
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('must save it to storage', function() {
          const stored = apiMethods.AUDITED_METHODS
            .filter(m => ! apiMethods.WITHOUT_USER_METHODS.includes(m))
            .filter(m => allowed.includes(m));
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when allowing nothing', function () {
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { allowed: [], unallowed: ['all'] }}},
            storage: { filter: { methods: { allowed: [], unallowed: ['all'] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, 0);
        });
        it('must save it to storage', function() {
          assert.equal(storageSpy.callCount, 0);
        });
      });
      describe('when using "events.all"', function() {
        let auditedMethods = [];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { allowed: ['events.all'], unallowed: [] }}},
            storage: { filter: { methods: { allowed: ['events.all'], unallowed: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            if (method.startsWith('events.')) auditedMethods.push(method);
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, auditedMethods.length);
        });
        it('must save it to storage', function() {
          assert.equal(storageSpy.callCount, auditedMethods.length);
        });
      });

    });
  });

});