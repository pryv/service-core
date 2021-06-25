/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
describe('Stores Streams', function() {
  let user, username, password, access, appAccessDummy;
  let personalToken;
  let mongoFixtures;
  
  const streamId = 'yo';
  before(async function() {
    await initTests();
    await initCore();
    mongoFixtures = getNewFixture();
    user = await mongoFixtures.user(charlatan.Lorem.characters(7), {
      password: password,
    });

    username = user.attrs.username;
    await user.stream({id: streamId, name: 'YO'});
    await user.stream({id: 'sonOfYo', name: 'Son of YO', parentId: streamId});
    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    accessesPath = '/' + username + '/accesses/';
    eventsPath = '/' + username + '/events/';
    streamsPath =  '/' + username + '/streams/';
    
    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', permissions: [{ streamId: streamId, level: 'manage'}, { streamId: ':dummy:', level: 'manage'}]});
    appAccessDummy = res.body.access;
    assert.exists(appAccessDummy);
  });

  after(async function() {
    await mongoFixtures.clean();
  });

  it('[1Q12] Must retrieve dummy streams when querying parentId', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessDummy.token)
      .query({parentId: ':dummy:'});
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length,1);
    assert.equal(streams[0].children.length,2);
    assert.equal(streams[0].name,user.username);
    assert.equal(streams[0].parentId,':dummy:');
  });

  it('[UVQ2] Must retrieve "yo" streams and ":dummy:" when requesting "*"', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccessDummy.token)
      .query({});
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length,3);
    assert.equal(streams[0].id,streamId);
    assert.equal(streams[0].children.length,1);
    assert.equal(streams[1].id,':dummy:');
    assert.equal(streams[2].id,':_audit:');
  });

});
