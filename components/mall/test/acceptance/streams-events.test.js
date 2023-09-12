/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, initTests, initCore, getNewFixture, charlatan, cuid, coreRequest  */

require('test-helpers/src/api-server-tests-config');
const { getConfig } = require('@pryv/boiler');

describe('Stores Streams', function () {
  let user, username, password, access, appAccessDummy, appAccessMaster;
  let personalToken;
  let mongoFixtures;
  let isOpenSource;
  let accessesPath, streamsPath;

  before(async () => {
    isOpenSource = (await getConfig()).get('openSource:isActive');
  });

  const streamId = 'yo';
  before(async function () {
    await initTests();
    await initCore();
    mongoFixtures = getNewFixture();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password
    });

    username = user.attrs.username;
    await user.stream({ id: streamId, name: 'YO' });
    await user.stream({ id: 'sonOfYo', name: 'Son of YO', parentId: streamId });
    access = await user.access({
      type: 'personal',
      token: cuid()
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    accessesPath = '/' + username + '/accesses/';
    streamsPath = '/' + username + '/streams/';

    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', permissions: [{ streamId, level: 'manage' }, { streamId: ':dummy:', level: 'manage' }] });
    appAccessDummy = res.body.access;
    assert.exists(appAccessDummy);

    const res2 = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access master', token: 'app-token-master', permissions: [{ streamId: '*', level: 'manage' }] });
    appAccessMaster = res2.body.access;
    assert.exists(appAccessMaster);
  });

  after(async function () {
    await mongoFixtures.clean();
  });

  it('[1Q12] Must retrieve dummy streams when querying parentId', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessDummy.token)
      .query({ parentId: ':dummy:' });
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].children.length, 2);
    assert.equal(streams[0].name, user.username);
    assert.equal(streams[0].parentId, ':dummy:');
  });

  it('[UVQ2] Must retrieve "yo" streams and ":dummy:" when requesting "*"', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessDummy.token)
      .query({});
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length, isOpenSource ? 2 : 3);
    assert.equal(streams[0].id, streamId);
    assert.equal(streams[0].children.length, 1);
    assert.equal(streams[1].id, ':dummy:');
    if (!isOpenSource) { assert.equal(streams[2].id, ':_audit:access-' + appAccessDummy.id); }
  });

  it('[XC20] master token must retrieve "yo" streams and all stores when requesting "*"', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessMaster.token)
      .query({});
    const streams = res.body.streams;
    assert.exists(streams);
    // we also get helpers here, because with the current implementation, it is returned.
    assert.equal(streams.length, isOpenSource ? 4 : 5);
    assert.equal(streams[0].id, ':dummy:');
    assert.equal(streams[1].id, ':faulty:');
    if (!isOpenSource) {
      assert.equal(streams[2].id, ':_audit:');
      assert.equal(streams[3].id, streamId);
      assert.equal(streams[3].children.length, 1);
    } else {
      assert.equal(streams[2].id, streamId);
      assert.equal(streams[2].children.length, 1);
    }
  });

  it('[XC21] personal token must retrive :dummy: stream structure', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .query({ parentId: ':dummy:' })
      .set('Authorization', personalToken)
      .query({});
    checkDummyStreamsStructure(res.body);
  });

  it('[XC22] app token must retrive :dummy: stream structure', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .query({ parentId: ':dummy:' })
      .set('Authorization', appAccessDummy.token)
      .query({});
    checkDummyStreamsStructure(res.body);
  });

  it('[XC23] master token must retrive :dummy: stream structure', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .query({ parentId: ':dummy:' })
      .set('Authorization', appAccessMaster.token)
      .query({});
    checkDummyStreamsStructure(res.body);
  });

  it('[3ZTM] Root streams must have null parentIds "*"', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessDummy.token)
      .query({});
    const streams = res.body.streams;
    for (const stream of streams) {
      assert.notExists(stream.parentId);
    }
  });
});

function checkDummyStreamsStructure (body) {
  assert.notExists(body.error);
  const streams = body.streams;
  assert.exists(streams);
  assert.equal(streams.length, 1, 'Should find one stream');
  assert.equal(streams[0].id, ':dummy:myself', 'Should find myself stream');
  assert.equal(streams[0].children.length, 2, 'myself stream should have two children');
  assert.equal(streams[0].children[0].id, ':dummy:mariana', 'myself stream should have mariana children');
  assert.equal(streams[0].children[1].id, ':dummy:antonia', 'myself stream should have antonia children');
}
