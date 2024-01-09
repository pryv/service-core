/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// TODO: enable linting again once implementation finished
/* eslint-disable */

/* global assert, initTests, initCore, getNewFixture, charlatan, cuid, coreRequest  */

require('test-helpers/src/api-server-tests-config');

describe('Per-store key-value DB', () => {
  let user, username, password, access;
  let personalToken;
  let mongoFixtures;
  let streamsPath, eventsPath;

  before(async () => {
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
    eventsPath = '/' + username + '/events/';
  });

  after(async () => {
    await mongoFixtures.clean();
  });

  it('[2Z7L] Must set and get key-value data', async () => {
    // requesting stream will update "lastStreamCall" event
    const resStream = await coreRequest
      .get(streamsPath)
      .set('Authorization', personalToken)
      .query({ parentId: ':dummy:myself' });
    const streams = resStream.body?.streams;
    assert.exists(streams);
    assert.equal(streams.length, 2);

    const resEvent = await coreRequest
      .get(eventsPath)
      .set('Authorization', personalToken)
      .query({ streams: [':dummy:antonia'] });
    const events = resEvent.body?.events;
    assert.exists(events);
    assert.equal(events.length, 1);
    assert.equal(events[0].content?.id, 'antonia');
  });
});
