/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


describe('Audit legacy route', function() {
  let user, username, password, access, readAccess;
  let personalToken;
  let auditPath;
  
  const streamId = 'yo';
  const appToken = 'my-app-token';
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
      .send({ type: 'app', name: 'app access', token: appToken, permissions: [{ streamId: streamId, level: 'manage'}]});
  });

  after(async function() {
    closeTests();
    await closeCore();
  });

  const complexQuery = {
    fromTime: 1560729600,
    toTime: 1560816000,
  };

  function validGet(path) { return coreRequest.get(path).set('Authorization', appToken);}
  function validPost(path) { return coreRequest.post(path).set('Authorization', appToken);}
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
      .set('Authorization', appToken)
      .query({fromTime: start, toTime: stop});
    console.log('TEST RESULT:', res.body);
    assert.equal(res.status, 200);
    const logs = res.body.auditLogs;
    assert.equal(logs.length, 2);
  });

  it.skip('must retrieve logs by eventType', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', appToken)
      .query({status: 403 });
    assert.equal(res.status, 200);
    
    const logs = res.body.auditLogs;
    assert.equal(logs.length, 1);
    console.log(logs);
  });

  it.skip('[6RP3] must retrieve audit logs by access id (from auth token then converted by service-core)', async () => {
    const res = await coreRequest
      .get(auditPath)
      .set('Authorization', readAccess.token);
    assert.strictEqual(res.status, 200);
    validateResults(res.body.auditLogs, 54, 'retrievedId', {});
  });

  it.skip('[TWQC] must retrieve audit logs according to a complex search query', async () => {
    const res = await coreRequest
      .get(auditPath)
      .query(complexQuery)
      .set('Authorization', readAccess.token);

    assert.strictEqual(res.status, 200);
    validateResults(res.body.auditLogs, 2, 'retrievedId', complexQuery);
  });

  describe('when providing a specific access id', function () {

    it.skip('[U9HQ] must retrieve audit logs by access id (from query param)', async () => {
      const res = await coreRequest
        .get(auditPath)
        .query({accessId: 'authorized'})
        .set('Authorization', readAccess.token);

      assert.strictEqual(res.status, 200);
      validateResults(res.body.auditLogs, 54, 'authorized', {});
    });

    it.skip('[P8HM] must retrieve audit logs according to a complex search query', async () => {
      const res = await coreRequest
        .get(auditPath)
        .query(Object.assign({}, complexQuery, {accessId: 'authorized'}))
        .set('Authorization', readAccess.token);

      assert.strictEqual(res.status, 200);
      validateResults(res.body.auditLogs, 2, 'authorized', complexQuery);
    });
  });

});

function validateResults(auditLogs, expectedLength, expectedAccessId, expectedProperties) {
  assert.isArray(auditLogs);
  assert.strictEqual(auditLogs.length, expectedLength);

  auditLogs.forEach(auditLog => {
    assert.strictEqual(auditLog.type, 'audit/core');
    assert.isString(auditLog.id);
    assert.isNumber(auditLog.time);

    assert.isDefined(auditLog.query);
    assert.isString(auditLog.action);
    assert.isNumber(auditLog.status);
    assert.isString(auditLog.forwardedFor);

    assert.strictEqual(auditLog.accessId, expectedAccessId);

    if (expectedProperties.errorId) {
      assert.strictEqual(auditLog.errorId, expectedProperties.errorId);
      assert.isString(auditLog.errorMessage);
    }
    if (expectedProperties.httpVerb) {
      assert.include(auditLog.action, expectedProperties.httpVerb);
    }
    if (expectedProperties.resource) {
      assert.include(auditLog.action, expectedProperties.resource);
    }
    if (expectedProperties.status) {
      assert.strictEqual(auditLog.status, expectedProperties.status);
    }
    if (expectedProperties.ip) {
      assert.strictEqual(auditLog.forwardedFor, expectedProperties.ip);
    }
    if (expectedProperties.fromTime && auditLog.time) {
      assert.isAtLeast(auditLog.time, expectedProperties.fromTime);
    }
    if (expectedProperties.toTime && auditLog.time) {
      // Since we ignore the time part of the iso date while filtering logs,
      // the event time may exceeds the toTime by at most 24 hours.
      const secondsInOneDay = 86400;
      assert.isAtMost(auditLog.time, expectedProperties.toTime + secondsInOneDay);
    }
  }); 
}