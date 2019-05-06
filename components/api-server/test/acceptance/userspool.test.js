// @flow

/* global describe, it, before, after */

const { context } = require('../test-helpers');

const chai = require('chai');
const assert = chai.assert;
const helpers = require('../helpers');

const storage = require('components/test-helpers').dependencies.storage.users;

describe('users pool', () => {
  const adminKey = helpers.dependencies.settings.auth.adminAccessKey;
  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop(); 
  });


  describe('create pool user', () => {
    let res;
    let poolUser;
    
    before(async () => {
      res = await createPoolUser(); 
      poolUser = res.body;
    });

    after((done) => {
      storage.removeAll(done);
    });

    it('MLYG-succeeds', () => {
      assert.notExists(res.body.error);
      assert.isTrue(res.ok);
      assert.exists(poolUser);
    });
    it('WGK9-contains a generated pool user id', () => {
      assert.isNotNull(poolUser.id);
    });
    it('2830-created a user in the database', () => {
      storage.findOne({ username: { $regex: new RegExp('^' + 'pool@') }}, null, (err, user) => {
        assert.isNull(err);
        assert.isNotNull(user);
      });
    });
    it('MD1S-created the related collections', () => {

    });
    it('0YGE-created the related indexes', () => {

    });
  });

  describe('get pool size', () => {
    let res;
    let poolSize;

    describe('when empty', () => {

      before(async () => {
        res = await server.request()
          .get('/system/pool/size')
          .set('Authorization', adminKey);
        poolSize = res.body.size;
      });

      it('H8VK-must succeed', () => {
        assert.isTrue(res.ok);
      });
      
      it('OHJQ-must return 0', () => {
        assert.exists(poolSize);
        assert.equal(poolSize, 0);
      });
    });

    describe('when adding pool users', () => {

      before(async () => {
        await createPoolUser();
        await createPoolUser();
        await createPoolUser();

        res = await server.request()
          .get('/system/pool/size')
          .set('Authorization', adminKey);

        poolSize = res.body.size;
      });

      after((done) => {
        storage.removeAll(done);
      });

      it('L16K-succeeds', () => {
        assert.isTrue(res.ok, 'response not ok');
        assert.notExists(res.body.error, 'response contains an error');
      });

      it('YPF3-has the right number of pool users', () => {
        assert.exists(poolSize, 'there is not pool size');
        assert.isTrue(poolSize === 3, 'the poolSize number is not as expected');
      });

    });
    
  });

  function createPoolUser() {
    return server.request()
      .post('/system/pool/create-user')
      .set('Authorization', adminKey)
      .send({});
  }
});
