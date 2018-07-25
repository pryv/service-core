// @flow

/* global describe, it, before, after, beforeEach, afterEach */

const { databaseFixture } = require('components/test-helpers');

const { produceMongoConnection, context } = require('../test-helpers');

const chai = require('chai');
const assert = chai.assert; 

const cuid = require('cuid');
const timestamp = require('unix-timestamp');

describe('accesses', () => {
  // Uses dynamic fixtures:
  const mongoFixtures = databaseFixture(produceMongoConnection());
  after(() => {
    mongoFixtures.clean(); 
  });
  
  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId, streamId, accessToken; 
  before(() => {
    userId = cuid(); 
    streamId = cuid();
    accessToken = cuid(); 
  });

  describe('when given a few existing accesses', () => {
    // Build the fixture
    before(() => {
      return mongoFixtures.user(userId, {}, function (user) {
        user.stream({id: streamId}, () => { });
        
        // A token that expired one day ago
        user.access({
          type: 'app', token: cuid(), 
          expires: timestamp.now('-1d'),
          name: 'expired access',
        });
        
        // A token that is still valid
        user.access({
          type: 'app', token: cuid(), 
          expires: timestamp.now('1d'),
          name: 'valid access',
        });
          
        // A token that did never expire
        user.access({
          type: 'app', token: cuid(), 
          name: 'doesnt expire',
        });

        user.access({token: accessToken, type: 'personal'});
        user.session(accessToken);
      });
    });

    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop(); 
    });

    describe('accesses.get', () => {
      it('returns only active accesses', async () => {
        const res = await server.request()
          .get(`/${userId}/accesses`)
          .set('Authorization', accessToken);
        
        assert.isNotNull(res.body.accesses);
        
        // No returned accesses are expired: 
        const isExpired = e => !! e.expires && e.expires < timestamp.now();
        
        for (const a of res.body.accesses) 
          assert.isFalse(isExpired(a), 
            `Access '${a.name}' is expired`);
      });
    });
  });
});