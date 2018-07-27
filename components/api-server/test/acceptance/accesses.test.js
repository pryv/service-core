// @flow

/* global describe, it, before, after, beforeEach */

const { databaseFixture } = require('components/test-helpers');

const { produceMongoConnection, context } = require('../test-helpers');

const lodash = require('lodash');
const chai = require('chai');
const assert = chai.assert; 

const cuid = require('cuid');
const timestamp = require('unix-timestamp');

describe('access expiry', () => {
  // Uses dynamic fixtures:
  const mongoFixtures = databaseFixture(produceMongoConnection());
  after(() => {
    mongoFixtures.clean(); 
  });
  
  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId, streamId, accessToken, expiredToken, validId;
  let hasExpiryId, hasExpiryToken;
  before(() => {
    userId = cuid(); 
    streamId = cuid();
    accessToken = cuid(); 
    expiredToken = cuid(); 
    validId = cuid(); 
    hasExpiryId = cuid(); 
    hasExpiryToken = cuid(); 
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
          permissions: [], 
        });
        
        // A token that is still valid
        user.access({
          id: hasExpiryId, 
          type: 'app', token: hasExpiryToken, 
          expires: timestamp.now('1d'),
          name: 'valid access',
          permissions: [
            {
              'streamId': 'diary',
              'defaultName': 'Diary',
              'level': 'read'
            }
          ]
        });
          
        // A token that did never expire
        user.access({
          id: validId,
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
    describe('accesses.create', () => {
      describe('when called with expireAfter>0', () => {
        const attrs = {
          name: 'For colleagues (1)',
          type: 'app',
          expireAfter: 3600, // in seconds
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
        };
        
        let res, access;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);
          
          access = res.body.access;
          
          if (! res.ok && res.body.error != null) {
            console.error(res.body.error);  // eslint-disable-line no-console
            // console.dir(res.body.error.data[0].inner);
          }
        });
        
        it('creates an access with set expiry timestamp', () => {
          assert.strictEqual(res.status, 201);
          assert.isAbove(access.expires, timestamp.now());
        });
      });
      describe('when called with expireAfter=0', () => {
        const attrs = {
          name: 'For colleagues (2)',
          expireAfter: 0, // in seconds
          type: 'app',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
        };
        
        let res, access;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);
          
          access = res.body.access;
          
          if (! res.ok && res.body.error != null) {
            console.error(res.body.error);  // eslint-disable-line no-console
            // console.dir(res.body.error.data[0].inner);
          }
        });
        
        it('creates an expired access', () => {
          assert.strictEqual(res.status, 201);
          assert.isAbove(timestamp.now(), access.expires);
        });
      });
      describe('when called with expireAfter<0', () => {
        const attrs = {
          name: 'For colleagues (3)',
          expireAfter: -100, // in seconds
          type: 'app',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
        };
        
        let res;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);
        });
                
        it('fails', () => {
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.body.error.message, 'expireAfter cannot be negative.');
        });
      });
    });
    describe('accesses.update', () => {
      describe('with expireAfter>0', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${validId}`)
            .set('Authorization', accessToken)
            .send({ expireAfter: 3700 });
            
          access = res.body.access;
          
          if (! res.ok && res.body.error) {
            console.error(res.body.error); // eslint-disable-line no-console
            // console.dir(res.body.error.data[0].inner);
          }
        });

        it("sets the 'expires' attribute", () => {
          assert.isTrue(res.ok);
          assert.isNotNull(access.expires);
          assert.isAbove(access.expires, timestamp.now('+1h'));
        });
      });
      describe('with expireAfter=0', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${validId}`)
            .set('Authorization', accessToken)
            .send({ expireAfter: 0 });
            
          access = res.body.access;
          
          if (! res.ok && res.body.error) {
            console.error(res.body.error); // eslint-disable-line no-console
            // console.dir(res.body.error.data[0].inner);
          }
        });

        it('expires the access immediately', () => {
          assert.isTrue(res.ok);
          assert.isNotNull(access.expires);
          assert.isAbove(timestamp.now(), access.expires);
        });
      });
      describe('with expires=null', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${hasExpiryId}`)
            .set('Authorization', accessToken)
            .send({ expires: null });
            
          access = res.body.access;
          
          if (! res.ok && res.body.error) {
            console.error(res.body.error); // eslint-disable-line no-console
            // console.dir(res.body.error.data[0].inner);
          }
        });

        it('removes expiry', () => {
          assert.isTrue(res.ok);
          assert.isNull(access.expires);
        });
      });
      
      describe('when trying to update itself with a longer expiration', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${hasExpiryId}`)
            .set('Authorization', hasExpiryToken)
            .send({ expireAfter: 3700 });
        });
        
        it('fails', () => {
          assert.isFalse(res.ok);
          assert.match(res.body.error.message, /^Unknown access/);
        });
      });
    });
    describe('accesses.checkApp', () => {
      describe('when the matching access is not expired', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send({ 
              requestingAppId: 'valid access', 
              requestedPermissions: [
                {
                  "streamId": "diary",
                  "defaultName": "Diary",
                  "level": "read"
                }
              ] 
            });
        });
        
        it('returns the matching access', () => {
          assert.isTrue(res.ok);
          assert.strictEqual(res.body.matchingAccess.token, hasExpiryToken);
        });
      });
      describe('when the matching access is expired', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send({ 
              requestingAppId: 'expired access', 
              requestedPermissions: [] 
            });
            
          // NOTE It is important that the reason why we have a mismatch here is
          // that the access is expired, not that we're asking for different 
          // permissions. 
        });
        
        it('returns no match', () => {
          assert.isUndefined(res.body.matchingAccess);
          
          const mismatching = res.body.mismatchingAccess;
          assert.strictEqual(mismatching.token, expiredToken);
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