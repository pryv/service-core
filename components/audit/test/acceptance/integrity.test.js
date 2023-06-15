/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, cuid, initTests, initCore, coreRequest, getNewFixture, charlatan */

const { integrity } = require('business');
const timestamp = require('unix-timestamp');

describe('Audit events integrity', function () {
  let user, username, password, access, appAccess;
  let personalToken;
  let mongoFixtures;
  let eventsPath, accessesPath;
  let auditedEvent;

  const streamId = 'yo';
  const now = timestamp.now();

  before(async function () {
    await initTests();
    await initCore();
    password = cuid();
    mongoFixtures = getNewFixture();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password
    });

    username = user.attrs.username;
    await user.stream({ id: streamId, name: 'YO' });
    access = await user.access({
      type: 'personal',
      token: cuid()
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    accessesPath = '/' + username + '/accesses/';
    eventsPath = '/' + username + '/events/';

    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', permissions: [{ streamId, level: 'manage' }] });
    appAccess = res.body.access;
  });

  after(async function () {
    await mongoFixtures.clean();
  });

  function validPost (path) { return coreRequest.post(path).set('Authorization', appAccess.token); }

  before(async () => {
    auditedEvent = (await validPost(eventsPath).send({ streamIds: [streamId], type: 'count/generic', content: 2 })).body.event;
  });

  it('[XLEL] created access has integrity', async () => {
    assert.exists(appAccess.integrity);
  });

  it('[ZKVC] created event has integrity', async () => {
    assert.exists(auditedEvent.integrity);
  });

  it('[WNWM] must find event integrity key and record value in the audit log ', async () => {
    const res = await coreRequest
      .get(eventsPath)
      .set('Authorization', appAccess.token)
      .query({ fromTime: now, streams: ':_audit:' });

    assert.exists(res.body?.events);
    assert.equal(1, res.body.events.length);

    const auditEvent = res.body.events[0];
    assert.exists(auditEvent.content.record);
    assert.equal(auditedEvent.integrity, auditEvent.content.record.integrity);

    const computedIntegrity = integrity.events.compute(auditedEvent);
    assert.equal(computedIntegrity.integrity, auditEvent.content.record.integrity);
    assert.equal(computedIntegrity.key, auditEvent.content.record.key);
  });

  it('[U09J] must find access integrity key and record value in the audit log ', async () => {
    const res = await coreRequest
      .get(eventsPath)
      .set('Authorization', personalToken)
      .query({ fromTime: now, streams: ':_audit:action-accesses.create' });

    assert.equal(1, res?.body?.events?.length);

    const auditEvent = res.body.events[0];
    assert.exists(auditEvent.content.record);
    assert.equal(appAccess.integrity, auditEvent.content.record.integrity);

    const computedIntegrity = integrity.accesses.compute(appAccess);
    assert.equal(computedIntegrity.integrity, auditEvent.content.record.integrity);
    assert.equal(computedIntegrity.key, auditEvent.content.record.key);
  });
});
