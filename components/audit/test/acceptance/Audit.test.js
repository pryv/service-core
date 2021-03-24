/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


/* global describe, before, after, it, assert, cuid, audit, config, initTests, closeTests, initCore, coreRequest, mongoFixtures */

describe('Audit', function() {
  let user, username, password, access, readAccess;
  let eventsPath, auditPath;

  let sysLogSpy, storageSpy;
  
  before(async function() {
    await initTests();
    await initCore();
    password = cuid();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password: password,
    });
    sysLogSpy = sinon.spy(audit.syslog, 'eventForUser');
    storageSpy = sinon.spy(audit.storage, 'forUser');

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
    await closeCore();
  });

  describe('when making valid API calls', function () {
    let res, now;
    before(async function () {
      now = Date.now() / 1000;
      res = await coreRequest
        .get(eventsPath)
        .set('Authorization', access.token);
    });

    it('[WTNL] must return 200', function () {
      assert.equal(res.status, 200);
    });
    it('[UZEV] must return logs when queried', async function() {
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
  
      it('[NJFO] must return 200', function () {
        assert.equal(res.status, 200);
      });
      it('[V10L] must not log it in syslog', function() {
        assert.isFalse(sysLogSpy.calledOnce);
      });
      it('[9RWP] must not save it to storage', function() {
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
  
      it('[81O6] must return 200', function () {
        assert.equal(res.status, 200);
      });
      it('[L92X] must log it in syslog', function() {
        assert.isTrue(sysLogSpy.calledOnce);
      });
      it('[G7UV] must return logs when queried', async function() {
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
      it('[7336] must have its custom accessId save to streamIds', function() {
        assert.include(log.streamIds, MethodContextUtils.AuditAccessIds.VALID_PASSWORD);
      });
    });
    describe('when making a call that has no userId', function() {
      before(async function () {
        resetSpies();
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
  
      it('[JU8F] must return 201', function () {
        assert.equal(res.status, 201);
        
      });
      it('[KPPH] must log it in syslog', function() {
        assert.isTrue(sysLogSpy.calledOnce);
      });
      it('[EI1U] must not log it to storage', async function() {
        assert.isFalse(storageSpy.calledOnce);
      });
    });
    
  });

  describe('when making invalid API calls', function() {
    let res;
    describe('for an unknown user', function() {
      before(async function() {
        resetSpies();
        res = await coreRequest
          .get('/unknown-username/events/')
          .set('Authorization', 'doesnt-matter')
      });
      it('[LFSW] must return 400', function() {
        assert.equal(res.status, 404);
      });
      it('[GM2Y] must not log it in syslog', function() {
        assert.isFalse(sysLogSpy.calledOnce);
      });
      it('[2IQO] must not save it to storage', function () {
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
      it('[7SUK] must return 400', function() {
        assert.equal(res.status, 400);
      });
      it('[N5OS] must return logs when queried', async function() {
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
      it('[XX4D] must return 400', function() {
        assert.equal(res.status, 400);
      });
      it('[BZT8] must return logs when queried', async function() {
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
      it('[9ZGI] must return 400', function() {
        assert.equal(res.status, 400);
      });
      it('[OBQ8] must return logs when queried', async function() {
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
      it('[ASLZ] must return 403', function() {
        assert.equal(res.status, 403);
      });
      it('[6CZ0] must return logs when queried', async function() {
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
        assert.deepEqual(log.streamIds, [log.content.error.id]);
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
      it('[WUUW] must return 403', function() {
        assert.equal(res.status, 403);
      });
      it('[14LS] must return logs when queried', async function() {
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
      it('[176G] must return 404', function() {
        assert.equal(res.status, 404);
      });
      it('[7132] must return logs when queried', async function() {
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
      describe('when including all', function() {
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: ['all'], exclude: [] }}},
            storage: { filter: { methods: { include: ['all'], exclude: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('[ADZL] must log it in syslog', function() {
          const numAudited = apiMethods.AUDITED_METHODS.length;
          assert.equal(sysLogSpy.callCount, numAudited);
        });
        it('[5243] must save it to storage', function() {
          const numStored = apiMethods.AUDITED_METHODS.length - apiMethods.WITHOUT_USER_METHODS.length;
          assert.equal(storageSpy.callCount, numStored);
        });
        
      });
      describe('when including all, but a few', function () {
        const exclude = ['events.get', 'auth.register', 'streams.create'];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: [], exclude: exclude }}},
            storage: { filter: { methods: { include: [], exclude: exclude }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('[Q2H9] must log it in syslog', function() {
          const logged = apiMethods.AUDITED_METHODS.filter(m => ! exclude.includes(m));
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('[BGXC] must save it to storage', function() {
          const stored = apiMethods.AUDITED_METHODS
            .filter(m => ! apiMethods.WITHOUT_USER_METHODS.includes(m))
            .filter(m => ! exclude.includes(m));
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when only including a few', function () {
        const include = ['events.get', 'auth.register', 'streams.create'];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include, exclude: [] }}},
            storage: { filter: { methods: { include, exclude: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('[WDZ9] must log it in syslog', function() {
          const logged = apiMethods.AUDITED_METHODS.filter(m => include.includes(m));
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('[E7S0] must save it to storage', function() {
          const stored = apiMethods.AUDITED_METHODS
            .filter(m => ! apiMethods.WITHOUT_USER_METHODS.includes(m))
            .filter(m => include.includes(m));
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when including nothing', function () {
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: [], exclude: ['all'] }}},
            storage: { filter: { methods: { include: [], exclude: ['all'] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('[NP6H] must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, 0);
        });
        it('[LV1C] must save it to storage', function() {
          assert.equal(storageSpy.callCount, 0);
        });
      });
      describe('when using a method aggregate (here "events.all")', function() {
        let auditedMethods = [];
        before(async function() {
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: ['events.all'], exclude: [] }}},
            storage: { filter: { methods: { include: ['events.all'], exclude: [] }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            if (method.startsWith('events.')) auditedMethods.push(method);
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
        });
        it('[L2KG] must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, auditedMethods.length);
        });
        it('[HSQS] must save it to storage', function() {
          assert.equal(storageSpy.callCount, auditedMethods.length);
        });
      });
      describe('when excluding a few', function () {
        let stored = [];
        let logged = [];
        before(async function() {
          const excluded = ['events.get', 'auth.login', 'auth.register'];
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: [], exclude: excluded }}},
            storage: { filter: { methods: { include: [], exclude: excluded }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
          stored = apiMethods.WITH_USER_METHODS.filter(m => ! excluded.includes(m));
          logged = apiMethods.AUDITED_METHODS.filter(m => ! excluded.includes(m));
        });
        it('[JBPZ] must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('[1ESH] must save it to storage', function() {
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when including and excluding some - without intersection', function () {
        let stored = [];
        let logged = [];
        before(async function() {
          const included = ['events.all', 'getAccessInfo'];
          const excluded = ['streams.all', 'auth.login', 'auth.register'];
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: included, exclude: excluded }}},
            storage: { filter: { methods: { include: included, exclude: excluded }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
          stored = apiMethods.WITH_USER_METHODS.filter(m => (m.startsWith('events.') || m === 'getAccessInfo'));
          logged = apiMethods.WITH_USER_METHODS.filter(m => (m.startsWith('events.') || m === 'getAccessInfo'));
        });
        it('[6GVQ] must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('[R7BF] must save it to storage', function() {
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
      describe('when including and excluding some - with intersection', function () {
        let stored = [];
        let logged = [];
        before(async function() {
          const included = ['events.all'];
          const excluded = ['events.get'];
          config.injectTestConfig({ audit: { 
            syslog: { filter: { methods: { include: included, exclude: excluded }}},
            storage: { filter: { methods: { include: included, exclude: excluded }}},
          }});
          await audit.reloadConfig();
          resetSpies();
          apiMethods.ALL_METHODS.forEach(method => {
            audit.eventForUser(cuid(), fakeAuditEvent(method));
          });
          stored = apiMethods.WITH_USER_METHODS.filter(m => (m.startsWith('events.') && m !== 'events.get'));
          logged = apiMethods.WITH_USER_METHODS.filter(m => (m.startsWith('events.') && m !== 'events.get'));
        });
        it('[UK0K] must log it in syslog', function() {
          assert.equal(sysLogSpy.callCount, logged.length);
        });
        it('[UOFZ] must save it to storage', function() {
          assert.equal(storageSpy.callCount, stored.length);
        });
      });
    });
  });

});