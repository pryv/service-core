describe('Stores Streams', function() {
  let user, username, password, access, appAccess;
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
    appAccess = res.body.access;
    assert.exists(appAccess);
  });

  after(async function() {
    await mongoFixtures.clean();
  });

  it('[1Q12] Must retrieve dummy streams', async () => {
    const res = await coreRequest
      .get(streamsPath)
      .set('Authorization', appAccess.token)
      .query({parentId: ':dummy:'});
    const streams = res.body.streams;
    assert.exists(streams);
    assert.equal(streams.length,1);
    assert.equal(streams[0].children.length,2);
    assert.equal(streams[0].name,user.username);
    assert.equal(streams[0].parentId,':dummy:');
  });

});
