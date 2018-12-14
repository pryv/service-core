// @flow

/* global describe, it, before, after, beforeEach */

const { context } = require('../test-helpers');

const chai = require('chai');
const assert = chai.assert;
const url = require('url');

//const helpers = require('./helpers');

//helpers.dependencies.settings.auth.adminAccessKey

describe('users pool', () => {
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

    function basePath() {
      return url.resolve(null, '/system');
    }
    
    beforeEach(async () => {
      res = await server.request()
        .post(basePath()+'/pool/create-user')
        //.set('Authorization', adminKey);
        .send({});
        
      poolUser = res.body.newUser;
    });

    it('succeeds', () => {
      console.log(res.body.error);
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
    
    beforeEach(async () => {
      res = await server.request()
        .get(basePath()+'/poll/get-size');
        //.set('Authorization', adminKey);
      
      poolSize = res.body.poolSize;
    });

    it('succeeds', () => {
      assert.isTrue(res.ok);
      assert.notExists(res.body.error);
      assert.exists(poolSize);
    });
  });
});
