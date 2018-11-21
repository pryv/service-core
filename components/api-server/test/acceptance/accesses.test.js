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
                  'streamId': 'diary',
                  'defaultName': 'Diary',
                  'level': 'read'
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

  function sampleAccess(name, clientData) {
    return {
      id: cuid(),
      type: 'app',
      name: name,
      permissions: [],
      clientData: clientData,
    };
  }
  
  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId, streamId, accessToken, complexClientData, existingAccess;
  let toBeUpdateAccess1, toBeUpdateAccess2, toBeUpdateAccess3, emptyClientDataAccess;
  let fixtureAccesses;
  before(() => {
    userId = cuid(); 
    streamId = cuid();
    accessToken = cuid();
    complexClientData = {
      aString: 'a random string',
      aNumber: 42,
      anArray: ['what', 'a', 'big', 'array', 'you', 'got'],
      anObject: {child: 'I feel empty', leaf: 42}
    };
    existingAccess = sampleAccess('Access with complex clientData', complexClientData);
    toBeUpdateAccess1 = sampleAccess('Access to be updated 1', complexClientData);
    toBeUpdateAccess2 = sampleAccess('Access to be updated 2', complexClientData);
    toBeUpdateAccess3 = sampleAccess('Access to be updated 3', complexClientData);
    emptyClientDataAccess = sampleAccess('Access with empty clientData', null);
    fixtureAccesses = [existingAccess, toBeUpdateAccess1, toBeUpdateAccess2, toBeUpdateAccess3, emptyClientDataAccess];
  });

  describe('when given a few existing accesses', () => {

    // Build the fixture
    before(() => {
      return mongoFixtures.user(userId, {}, function (user) {
        user.stream({id: streamId}, () => { });
        user.access({token: accessToken, type: 'personal'});
        user.access(existingAccess);
        user.access(toBeUpdateAccess1);
        user.access(toBeUpdateAccess2);
        user.access(toBeUpdateAccess3);
        user.access(emptyClientDataAccess);
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
      let res, accesses; 
      before(async () => {
        res = await server.request()
          .get(`/${userId}/accesses`)
          .set('Authorization', accessToken);
          
        accesses = res.body.accesses;
      });

      it('succeeds', () => {
        assert.exists(accesses);
      });

      it('contains existing accesses with clientData', () => {
        for (const a of accesses) {
          const fixtureAccess =
            fixtureAccesses.find(f => {return f.id === a.id;});
          if (fixtureAccess != null)
            assert.deepEqual(a.clientData, fixtureAccess.clientData);
        }
      });
    });

    describe('accesses.create', () => {

      function sampleAccess (name, clientData) {
        return {
          name: name,
          type: 'app',
          permissions: [
            {
              streamId: 'work',
              level: 'read',
            },
          ],
          clientData: clientData,
        };
      }

      function checkResultingAccess (res) {
        const access = res.body.access;
        assert.isTrue(res.ok);
        assert.notExists(res.body.error);
        assert.exists(access);
        return access;
      }

      describe('when called with clientData={}', () => {
        let res, access;
        before(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(sampleAccess('With empty clientData', {}));
          
          access = checkResultingAccess(res);
        });
        
        it('creates an access with empty clientData', () => {
          assert.strictEqual(res.status, 201);
          assert.deepEqual(access.clientData, {});
        });
      });

      describe('when called with clientData=null', () => {
        let res;
        before(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(sampleAccess('With null clientData', null));
        });
        
        it('throws a schema error', () => {
          assert.isFalse(res.ok);
          assert.exists(res.body.error);
        });
      });

      describe('when called with complex clientData', () => {
        let res, access;
        before(async () => {
          res = await server.request()
            .post(`/${userId}/accesses`)
            .set('Authorization', accessToken)
            .send(sampleAccess('With complex clientData', complexClientData));

          access = checkResultingAccess(res);
        });
                
        it('creates an access with complex clientData', () => {
          assert.strictEqual(res.status, 201);
          assert.deepEqual(access.clientData, complexClientData);
        });
      });
    });

    describe('accesses.update', () => {

      function checkResultingAccess (res) {
        const access = res.body.access;
        assert.isTrue(res.ok);
        assert.notExists(res.body.error);
        assert.exists(access);
        return access;
      }

      describe('if existing clientData was not empty', () => {
        const clientDataUpdate = {
          aString: null,
          aNumber: 'it was a number',
          anArray: ['big', 'array', 'you', 'got'],
          anObject: {child: 'I feel really empty', leaf: null, newProp: 42},
          aNewProp: 42
        };

        let res, access; 
        before(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${toBeUpdateAccess1.id}`)
            .set('Authorization', accessToken)
            .send({ clientData: clientDataUpdate});
            
          access = checkResultingAccess(res);
        });

        it('updates previous clientData with new clientData', () => {
          assert.exists(access.clientData);
          assert.deepEqual(access.clientData, clientDataUpdate);
        });
      });

      describe('if clientData is not provided', () => {
        let res, access; 
        before(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${toBeUpdateAccess2.id}`)
            .set('Authorization', accessToken)
            .send({ name: 'Updated access' });
            
          access = checkResultingAccess(res);
        });

        it('keeps existing clientData untouched', () => {
          assert.exists(access.clientData);
          assert.deepEqual(access.clientData, toBeUpdateAccess2.clientData);
        });
      });
      
      describe('if existing clientData was empty', () => {

        let res, access; 
        before(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${emptyClientDataAccess.id}`)
            .set('Authorization', accessToken)
            .send({ clientData: complexClientData});
            
          access = checkResultingAccess(res);
        });

        it('sets clientData to provided clientData', () => {
          assert.exists(access.clientData);
          assert.deepEqual(access.clientData, complexClientData);
        });
      });
      
      describe('if provided clientData is explicitely null', () => {
        let res, access; 
        before(async () => {
          res = await server.request()
            .put(`/${userId}/accesses/${toBeUpdateAccess3.id}`)
            .set('Authorization', accessToken)
            .send({ clientData: null });

          access = checkResultingAccess(res);
        });
        
        it('removes existing clientData', () => {
          assert.notExists(access.clientData);
        });
      });
    });

    describe('accesses.checkApp', () => {

      async function checkAppRequest(req) {
        const res = await server.request()
          .post(`/${userId}/accesses/check-app`)
          .set('Authorization', accessToken)
          .send(req);

        assert.isTrue(res.ok);
        assert.exists(res.body);
        assert.notExists(res.body.error);
        return res.body;
      }

      describe('when the provided clientData matches the existing clientData', () => {
        let body;
        before(async () => {
          body = await checkAppRequest({ 
            requestingAppId: existingAccess.name,
            requestedPermissions: existingAccess.permissions,
            clientData: existingAccess.clientData,
          });
        });
        
        it('returns the matching access', () => {
          assert.exists(body.matchingAccess);
          assert.strictEqual(body.matchingAccess.id, existingAccess.id);
        });
      });
      
      describe('when the provided clientData does not match the existing clientData', () => {
        let body; 
        before(async () => {
          body = await checkAppRequest({
            requestingAppId: existingAccess.name,
            requestedPermissions: existingAccess.permissions,
            clientData: {},
          });
        });
        
        it('returns no match', () => {
          assert.exists(body.mismatchingAccess);
          assert.strictEqual(body.mismatchingAccess.id, existingAccess.id);
        });
      });

      describe('when no clientData is provided but existing access has one', () => {
        let body; 
        before(async () => {
          body = await checkAppRequest({
            requestingAppId: existingAccess.name,
            requestedPermissions: existingAccess.permissions,
          });
        });
        
        it('returns no match', () => {
          assert.exists(body.mismatchingAccess);
          assert.strictEqual(body.mismatchingAccess.id, existingAccess.id);
        });
      });
    });
  });
});