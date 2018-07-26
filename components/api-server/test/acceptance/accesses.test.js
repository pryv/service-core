// @flow

/* global describe, it, before, after, beforeEach */

const { databaseFixture } = require('components/test-helpers');

const { produceMongoConnection, context } = require('../test-helpers');

const lodash = require('lodash');
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
  let userId, streamId, accessToken, expiredToken; 
  before(() => {
    userId = cuid(); 
    streamId = cuid();
    accessToken = cuid(); 
    expiredToken = cuid(); 
  });

  describe('when given a few existing accesses', () => {
    // Build the fixture
    before(() => {
      return mongoFixtures.user(userId, {}, function (user) {
        user.stream({id: streamId}, () => { });
        
        // A token that expired one day ago
        user.access({
          type: 'app', token: expiredToken, 
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

    const isExpired = e => !! e.expires && e.expires < timestamp.now();

    describe('accesses.get', () => {
      describe('vanilla version', () => {
        let res; 
        let accesses; 
        
        beforeEach(async () => {
          res = await server.request()
            .get(`/${userId}/accesses`)
            .set('Authorization', accessToken);
            
          accesses = res.body.accesses;
        });

        it('succeeds', () => {
          assert.isNotNull(accesses);
        });
        it('contains only active accesses', () => {
          for (const a of accesses) 
            assert.isFalse(isExpired(a), 
              `Access '${a.name}' is expired`);
        });
      });

      describe('when given the includeExpired=true parameter', () => {
        let res; 
        let accesses; 
        
        beforeEach(async () => {
          res = await server.request()
            .get(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .query('includeExpired=true');
            
          accesses = res.body.accesses;
        });
        
        it('succeeds', () => {
          assert.isNotNull(accesses);
        });
        it('includes expired accesses', () => {
          assert.isAbove(lodash.filter(accesses, isExpired).length, 0);
        });
      });
    });
    describe('other API accesses', () => {
      
      function apiAccess(token) {
        return server.request()
          .get(`/${userId}/events`)
          .set('Authorization', token);
      }
      
      describe('using an expired access', () => {
        let res;
        beforeEach(async () => {
          res = await apiAccess(expiredToken);
        });
        
        it('fails', () => {
          assert.strictEqual(res.status, 403);
        });
        it('returns a proper error message', () => {
          const error = res.body.error; 
          
          assert.isNotNull(error);
          assert.strictEqual(error.id, 'forbidden');
          assert.strictEqual(error.message, 'Access has expired.');
        });
      });
      describe('using a valid access', () => {
        let res;
        beforeEach(async () => {
          res = await apiAccess(accessToken);
        });
          
        it('succeeds', () => {
          assert.strictEqual(res.status, 200);
        });
      });
    });
  });
});