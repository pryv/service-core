/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

require('test-helpers/src/api-server-tests-config');
const timestamp = require('unix-timestamp');
const sinon = require('sinon');
const chai = require('chai');
const assert = chai.assert;
const MethodContext = require('../../src/MethodContext');

const contextSource = {
  name: 'test',
  ip: '127.0.0.1'
};

describe('MethodContext', () => {
  describe('#parseAuth', () => {
    const username = 'USERNAME';
    const customAuthStep = null;
    it('[ZRW8] should parse token out', () => {
      const mc = new MethodContext(contextSource, username, 'TOKEN', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.isNull(mc.callerId);
    });
    it('[AUIY] should also parse the callerId when available', () => {
      const mc = new MethodContext(contextSource, username, 'TOKEN CALLERID', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.strictEqual(mc.callerId, 'CALLERID');
    });
  });

  describe('#retrieveAccessFromId', () => {
    const username = 'USERNAME';
    const customAuthStep = null;
    let access;
    let mc, findOne, storage;
    beforeEach(() => {
      mc = new MethodContext(contextSource, username, 'TOKEN CALLERID', customAuthStep);
      access = {
        id: 'accessIdFromAccess',
        token: 'tokenFromAccess'
      };
      findOne = sinon.fake.yields(null, access);
      storage = {
        accesses: {
          findOne
        }
      };
    });
    it('[OJW2] checks expiry of the access', async () => {
      access.expires = timestamp.now('-1d');
      let caught = false;
      try {
        // storage is a fake
        await mc.retrieveAccessFromId(storage, 'accessId');
      } catch (err) {
        caught = true;
      }
      assert.isTrue(caught);
    });
  });
});
