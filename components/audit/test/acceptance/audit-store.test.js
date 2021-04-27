/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global describe, before, after, it, assert, cuid, audit, config, initTests, initCore, coreRequest, getNewFixture, addActionStreamIdPrefix, addAccessStreamIdPrefix */


describe('Audit Streams and Events', function() {
  let user, username, password, access, appAccess;
  let personalToken;
  let auditPath;
  let mongoFixtures;
  
  const streamId = 'yo';
  before(async function() {
    await initTests();
    await initCore();
    password = cuid();
    mongoFixtures = getNewFixture();
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
    
    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', 
      permissions: [{ streamId: streamId, level: 'manage'}]});
    appAccess = res.body.access;
    assert.exists(appAccess);
  });

  after(async function() {
    await mongoFixtures.clean();
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

  it('[TJ8S] must retrieve logs by time range', async () => {
    const res = await coreRequest
      .get(eventsPath)
      .set('Authorization', appAccess.token)
      .query({streams: ['.audit-access:' +  appAccess.id], fromTime: start, toTime: stop});

    console.log(res.body);
    assert.equal(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 2);
    for (let event of logs) {
      assert.isAtLeast(event.time, start);
      assert.isAtMost(event.time, stop);
    }
    validateResults(logs, appAccess.id);
  });

  it('[8AFA]  must retrieve logs by action', async () => {
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

  it('[0XRA]  personal token must retrieve all audit logs', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', personalToken);
    assert.strictEqual(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 5);
    validateResults(res.body.auditLogs);
  });

  it('[31FM]  appAccess must retrieve only audit logs for this access (from auth token then converted by service-core)', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', appAccess.token);
    assert.strictEqual(res.status, 200);
    const logs = res.body.auditLogs;
    assert.isAtLeast(logs.length, 1);
    validateResults(logs, appAccess.id);
  });

  it('[BLR4]  Invalid token should retrun an error', async () => {
    const res = await coreRequest
    .get(auditPath)
    .set('Authorization', 'invalid');
    assert.strictEqual(res.status, 403);
    assert.exists(res.body.error);
    assert.equal(res.body.error.id, 'invalid-access-token')
  });

  it('[DTBU]  StreamId not starting with ".audit-"  should return an error', async () => {
    const res = await coreRequest
    .get(auditPath)
    .set('Authorization', appAccess.token)
    .query({streams: ['toto'] });
    assert.strictEqual(res.status, 400);
    assert.exists(res.body.error);
    assert.equal(res.body.error.id, 'invalid-request-structure');
    assert.equal(res.body.error.message, 'Invalid "streams" parameter. It should be an array of streamIds starting with Audit prefix: ".audit-"');
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