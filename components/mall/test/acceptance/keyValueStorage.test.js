/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, initTests, initCore, getNewFixture, charlatan, cuid, coreRequest  */

require('test-helpers/src/api-server-tests-config');

describe('Stores KeyValue Storage', function () {
  let user, username, password, access;
  let personalToken;
  let mongoFixtures;
  let streamsPath;

  before(async function () {
    await initTests();
    await initCore();
    mongoFixtures = getNewFixture();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password
    });

    username = user.attrs.username;
    access = await user.access({
      type: 'personal',
      token: cuid()
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    streamsPath = '/' + username + '/streams/';
  });

  after(async function () {
    await mongoFixtures.clean();
  });

  it('[2Z7L] Must retrieve dummy streams when querying parentId', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', personalToken)
      .query({ parentId: ':dummy:' });
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].children.length, 2);
    assert.equal(streams[0].name, user.username);
    assert.equal(streams[0].parentId, ':dummy:');
  });
});
