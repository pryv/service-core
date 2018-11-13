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

    const isExpired = e => e.expires != null && timestamp.now() > e.expires;

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

describe('access client data', () => {
  // Uses dynamic fixtures:
  const mongoFixtures = databaseFixture(produceMongoConnection());
  after(() => {
    mongoFixtures.clean(); 
  });
  
  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId, streamId, accessToken;
  let hasClientDataId1, hasClientDataId2, hasClientDataId3;
  let emptyClientDataId, noClientDataId;
  let simpleClientData, complexClientData;
  before(() => {
    userId = cuid(); 
    streamId = cuid();
    accessToken = cuid(); 
    hasClientDataId1 = cuid();
    hasClientDataId2 = cuid();
    hasClientDataId3 = cuid();
    emptyClientDataId = cuid();
    noClientDataId = cuid();
    complexClientData = {
      aString: 'a random string',
      aNumber: 42,
      anArray: ['what', 'a', 'big', 'array', 'you', 'got'],
      anObject: {child: 'I feel empty', leaf: 42}
    };
    simpleClientData = {
      aString: 'a random string',
    };
  });

  describe('when given a few existing accesses', () => {
    // Build the fixture
    before(() => {
      return mongoFixtures.user(userId, {}, function (user) {
        user.stream({id: streamId}, () => { });
        
        // Accesses with clientData
        user.access({
          id: hasClientDataId1,
          type: 'app',
          name: 'access with clientData',
          permissions: [],
          clientData: complexClientData,
        });

        user.access({
          id: hasClientDataId2,
          type: 'app',
          name: 'access with clientData (1)',
          permissions: [],
          clientData: simpleClientData,
        });

        user.access({
          id: hasClientDataId3,
          type: 'app',
          name: 'access with clientData (2)',
          permissions: [],
          clientData: {
            aNumber: 42
          },
        });
        
        // An access with empty clientData
        user.access({
          id: emptyClientDataId,
          type: 'shared',
          name: 'access with emtpy clientData',
          permissions: [],
          clientData: {},
        });

        // An access without clientData
        user.access({
          id: noClientDataId,
          type: 'shared',
          name: 'access without clientData',
          permissions: [],
          clientData: null,
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

      it('contains clientData', () => {
        for (const a of accesses) {
          if (a.id !== noClientDataId) {
            assert.isNotNull(a.clientData,
              `Access '${a.name}' has no clientData`);
          }
        }
      });
    });
    describe('accesses.create', () => {
      describe('when called with clientData={}', () => {
        const attrs = {
          name: 'With empty clientData',
          type: 'app',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
          clientData: {},
        };
        
        let res, access;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);
          
          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });
        
        it('creates an access with empty clientData', () => {
          assert.strictEqual(res.status, 201);
          assert.deepEqual(access.clientData, {});
        });
      });
      describe('when called with clientData=null', () => {
        const attrs = {
          name: 'With null clientData',
          type: 'shared',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
          clientData: null,
        };
        
        let res, access;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);
          
          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });
        
        it('creates an access without any clientData', () => {
          assert.strictEqual(res.status, 201);
          assert.isNull(access.clientData);
        });
      });
      describe('when called with complex clientData', () => {
        const attrs = {
          name: 'With complex clientData',
          type: 'app',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
          clientData: complexClientData
        };
        
        let res, access;
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(attrs);

          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });
                
        it('creates an access with complex clientData', () => {
          assert.strictEqual(res.status, 201);
          assert.deepEqual(access.clientData, complexClientData);
        });
      });
    });
    describe('accesses.update', () => {
      describe('if existing clientData was not empty', () => {
        const clientDataUpdate = {
          aString: null,
          aNumber: 'it was a number',
          anArray: ['big', 'array', 'you', 'got'],
          anObject: {child: 'I feel really empty', leaf: null, newProp: 42},
          aNewProp: 42
        };
        const mergedClientData = {
          aNumber: 'it was a number',
          anArray: ['big', 'array', 'you', 'got'],
          anObject: {child: 'I feel really empty', newProp: 42},
          aNewProp: 42
        };

        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${hasClientDataId1}`)
            .set('Authorization', accessToken)
            .send({ clientData: clientDataUpdate});
            
          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });

        it('merges previous and new clientData', () => {
          assert.isNotNull(access.clientData);
          assert.deepEqual(access.clientData, mergedClientData);
        });
      });
      
      describe('if existing clientData was empty', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${emptyClientDataId}`)
            .set('Authorization', accessToken)
            .send({ clientData: complexClientData });
            
          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });

        it('sets clientData to provided clientData', () => {
          assert.isNotNull(access.clientData);
          assert.deepEqual(access.clientData, complexClientData);
        });
      });
      describe('if clientData is not provided or explicitly null', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${hasClientDataId2}`)
            .set('Authorization', accessToken)
            .send({ clientData: null });
            
          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });

        it('keeps existing clientData untouched', () => {
          assert.isNotNull(access.clientData);
          assert.deepEqual(access.clientData, simpleClientData);
        });
      });
      
      describe('if provided clientData={}', () => {
        let res, access; 
        beforeEach(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${hasClientDataId3}`)
            .set('Authorization', accessToken)
            .send({ clientData: {} });

          access = res.body.access;
          assert.isTrue(res.ok);
          assert.isNull(res.body.error);
          assert.isNotNull(access);
        });
        
        it('empties existing clientData', () => {
          assert.isNotNull(access.clientData);
          assert.deepEqual(access.clienData, {});
        });
      });
    });
    describe('accesses.checkApp', () => {
      describe('when the provided clientData matches the existing clientData', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send({ 
              requestingAppId: 'access with clientData', 
              requestedPermissions: [],
              clientData: complexClientData,
            });
          assert.isTrue(res.ok);
          assert.isNotNull(res.body);
          assert.isNull(res.body.error);
        });
        
        it('returns the matching access', () => {
          assert.isNotNull(res.body.matchingAccess);
          assert.strictEqual(res.body.matchingAccess.id, hasClientDataId1);
        });
      });
      describe('when the provided clientData does not match the existing clientData', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send({ 
              requestingAppId: 'access with clientData', 
              requestedPermissions: [],
              clientData: simpleClientData,
            });

          assert.isTrue(res.ok);
          assert.isNotNull(res.body);
          assert.isNull(res.body.error);
            
          // NOTE It is important that the reason why we have a mismatch here is
          // that the access client data differs, not that we're asking for different 
          // permissions. 
        });
        
        it('returns no match', () => {
          assert.isNull(res.body.matchingAccess);
          assert.strictEqual(res.body.mismatchingAccess.id, hasClientDataId1);
        });
      });
      describe('when the provided clientData is null but not the existing clientData', () => {
        let res; 
        beforeEach(async () => {
          res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send({ 
              requestingAppId: 'access with clientData', 
              requestedPermissions: [],
              clientData: null,
            });

          assert.isTrue(res.ok);
          assert.isNotNull(res.body);
          assert.isNull(res.body.error);
            
          // NOTE It is important that the reason why we have a mismatch here is
          // that the access client data differs, not that we're asking for different 
          // permissions. 
        });
        
        it('returns no match', () => {
          assert.isNull(res.body.matchingAccess);
          assert.strictEqual(res.body.mismatchingAccess.id, hasClientDataId1);
        });
      });
    });
  });
});