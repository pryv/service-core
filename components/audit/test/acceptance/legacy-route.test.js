/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global describe, before, after, it, assert, cuid, audit, config, initTests, closeTests, initCore, coreRequest, mongoFixtures, addActionStreamIdPrefix, addAccessStreamIdPrefix */


describe('Audit legacy route', function() {
  let user, username, password, access, appAccess;
  let personalToken;
  let auditPath;
  
  const streamId = 'yo';
  before(async function() {
    await initTests();
    await initCore();
    password = cuid();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password: password,
    });

    username = user.attrs.username;
    await user.stream({id: streamId, name: 'YO'});
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    accessesPath = '/' + username + '/accesses/';
    eventsPath = '/' + username + '/events/';
    auditPath =  '/' + username + '/audit/logs/';
    
    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', permissions: [{ streamId: streamId, level: 'manage'}]});
    appAccess = res.body.access;
    assert.exists(appAccess);
  });

  after(async function() {
    closeTests();
    await closeCore();
  });

  function validGet(path) { return coreRequest.get(path).set('Authorization', appAccess.token);}
  function validPost(path) { return coreRequest.post(path).set('Authorization', appAccess.token);}
  function forbiddenGet(path) {return coreRequest.get(path).set('Authorization', 'whatever');}

  let start, stop;
  before(async () => {
    start = Date.now() / 1000;
    await validGet(eventsPath);
    await validPost(eventsPath)
      .send({ streamIds: [streamId], type: 'count/generic', content: 2});
    stop = Date.now() / 1000;
    await validGet(eventsPath);
    await validGet(eventsPath)
      .query({streams: ['other']});
  });

  it('[QXCH] must retrieve logs by time range', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', appAccess.token)
      .query({fromTime: start, toTime: stop});
    assert.equal(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 2);
    for (let event of logs) {
      assert.isAtLeast(event.time, start);
      assert.isAtMost(event.time, stop);
    }
    validateResults(logs, appAccess.id);
  });

  it('[4FB8] must retrieve logs by action', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', appAccess.token)
      .query({streams: ['.audit-action:events.get'] });
    assert.equal(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 1);
    for (let event of logs) {
      assert.exists(event.content);
      assert.equal(event.content.action, 'events.get');
    }
    validateResults(logs, appAccess.id);
  });

  it('[U9HQ] personal token must retrieve all audit logs', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', personalToken);
    assert.strictEqual(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 5);
    validateResults(res.body.auditLogs);
  });

  it('[6RP3] appAccess must retrieve only audit logs for this access (from auth token then converted by service-core)', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', appAccess.token);
    assert.strictEqual(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 1);
    validateResults(logs, appAccess.id);
  });

});

function validateResults(auditLogs, expectedAccessId, expectedErrorId) {
  assert.isArray(auditLogs);

  auditLogs.forEach(event => {
    assert.strictEqual(event.type, 'log/user-api');
    assert.isString(event.id);
    assert.isNumber(event.time);

    assert.isDefined(event.content.query);
    assert.isString(event.content.action);
    assert.include(event.streamIds, addActionStreamIdPrefix(event.content.action), 'missing Action StreamId');
    assert.isNumber(event.content.status);

    assert.isDefined(event.content.source);
    assert.isString(event.content.source.name);
    assert.isString(event.content.source.ip);

    if (expectedAccessId) {
     assert.include(event.streamIds, addAccessStreamIdPrefix(expectedAccessId), 'missing Access StreamId');
    }

    if (expectedErrorId) {
      assert.isDefined(event.content.error);
      assert.strictEqual(event.content.error.id, expectedErrorId);
      assert.isString(event.content.error.message);
    }
  }); 
}