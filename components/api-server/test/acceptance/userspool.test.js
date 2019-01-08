// @flow

/* global describe, it, before, after */

const { context } = require('../test-helpers');

const chai = require('chai');
const assert = chai.assert;
const helpers = require('../helpers');

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
      res = await server.request()
        .post('/system/pool/create-user')
        .set('Authorization', adminKey)
        .send({});
        
      poolUser = res.body;
    });

    it('succeeds', () => {
      assert.notExists(res.body.error);
      assert.isTrue(res.ok);
      assert.exists(poolUser);
    });
    it('contains a generated pool user id', () => {
      assert.isNotNull(poolUser.id);
    });
  });

  describe('get pool size', () => {
    let res;
    let poolSize;
    
    before(async () => {
      res = await server.request()
        .get('/system/pool/size')
        .set('Authorization', adminKey);
      
      poolSize = res.body.size;
    });

    it('succeeds', () => {
      assert.isTrue(res.ok);
      assert.notExists(res.body.error);
      assert.exists(poolSize);
      assert.isTrue(poolSize>=0);
    });
  });
});
