/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global cache, describe, before, after, it, assert, cuid, config, initTests, initCore, coreRequest, getNewFixture */

const STREAMS = { 
  A: {}, 
    A1: { parentId: 'A' },
    A2: { parentId: 'A' },
  B: {}, 
    B1: { parentId: 'B' }, 
    B2: { parentId: 'B' }, 
  T: { }, 
};

describe('Cache', function() {
  let user, username, password, access, appAccess;
  let personalToken;
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

    for (const [streamId, streamData] of Object.entries(STREAMS)) {
      const stream = {
        id: streamId,
        name: 'stream ' + streamId,
        parentId: streamData.parentId
      }
      await user.stream(stream);
    };

    access = await user.access({
      type: 'personal',
      token: cuid(),
    });
    personalToken = access.attrs.token;
    await user.session(personalToken);
    user = user.attrs;
    accessesPath = '/' + username + '/accesses/';
    eventsPath = '/' + username + '/events/';
    streamsPath = '/' + username + '/streams/';
    
    const res = await coreRequest.post(accessesPath)
      .set('Authorization', personalToken)
      .send({ type: 'app', name: 'app access', token: 'app-token', permissions: [{ streamId: 'A', level: 'manage'}]});
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

  this.beforeEach(() => {
    // make sure config is clean;
    config.injectTestConfig({});
  });

  it('[FELT] Second get stream must be faster that first one', async () => {
    let t1 = hrtime();
    const res1 = await coreRequest.get(streamsPath).set('Authorization', appAccess.token).query({});
    t1 = hrtime(t1);
    assert.equal(res1.status, 200);

    let t2 = hrtime();
    const res2 = await coreRequest.get(streamsPath).set('Authorization', appAccess.token).query({});
    t2 = hrtime(t2);
    assert.equal(res2.status, 200);

    config.injectTestConfig({caching: {isActive : false }});
    cache.clear();

    let t3 = hrtime();
    const res3 = await coreRequest.get(streamsPath).set('Authorization', appAccess.token).query({});
    t3 =  hrtime(t3);
  
    const data = `first-with-cache: ${t1}, second-with-cache: ${t2}, no-cache: ${t3}  => `;
    assert.isBelow(t2,t1, 'second-with-cache streams.get should be faster than first-with-cache' + data);
    assert.isAbove(t3,t1, 'no-cache streams.get should be longer than first-with-cache' + data);
    assert.isAbove(t3,t2 * 1.5 , 'cache streams.get should be at least 50% longer than second-with-cache ' + data);
  });

  it('[XDP6] Cache should reset permissions on stream structure change when moving a stream in and out ', async () => {
    const res1 = await coreRequest.get(eventsPath).set('Authorization', appAccess.token).query({streams: ['T']});
    assert.equal(res1.status, 403, 'should fail accessing forbiddden stream');
    console.log('Cache: ', cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, username + '/' + appAccess.token)._streamPermissionLevelCache);

    // move stream T as child of A
    console.log('\n\n***** 2');
    const res2 = await coreRequest.put(streamsPath + 'T').set('Authorization', personalToken).send({parentId: 'A'});
    assert.equal(res2.status, 200);
    //const res22 = await coreRequest.get(streamsPath).set('Authorization', personalToken).query({});
    //console.log('Res get streams', res22.body);

    console.log('Cache: ', cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, username + '/' + appAccess.token)._streamPermissionLevelCache);
    //cache.clear();
    
    console.log('\n\n***** 3');
    const res3 = await coreRequest.get(eventsPath).set('Authorization', appAccess.token).query({streams: ['T']});
    assert.equal(res3.status, 200, 'should have access to stream once moved into authorized scope');

    

    // move stream T out of A
    console.log('\n\n***** 4');
    const res4 = await coreRequest.put(streamsPath + 'T').set('Authorization', personalToken).send({parentId: null});
    assert.equal(res4.status, 200);

    console.log('Cache: ', cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, username + '/' + appAccess.token)._streamPermissionLevelCache);

    cache.clear();
    console.log('\n\n***** 5');
    const res5 = await coreRequest.get(eventsPath).set('Authorization', appAccess.token).query({streams: ['T']});
    console.log(res5.body);
    assert.equal(res5.status, 403, 'should not have acces once move out of authorized scope');
    console.log('Cache: ', cache.get(cache.NS.ACCESS_LOGIC_BY_USERIDTOKEN, username + '/' + appAccess.token)._streamPermissionLevelCache);
  });


});

function hrtime(hrTime) {
  const time = process.hrtime(hrTime);
  if (hrTime == null) return time;
  return time[0] * 1000000000 + time[1];
}