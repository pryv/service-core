// @flow

/* global describe, it, beforeEach */

const timestamp = require('unix-timestamp');

const sinon = require('sinon');

const chai = require('chai');

const { assert } = chai;

const MethodContext = require('../../src/MethodContext');

describe('MethodContext', () => {
  describe('#parseAuth', () => {
    const username = 'USERNAME';
    const customAuthStep = null;

    it('[ZRW8] should parse token out', () => {
      const mc = new MethodContext(username, 'TOKEN', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.isNull(mc.callerId);
    });
    it('[AUIY] should also parse the callerId when available', () => {
      const mc = new MethodContext(username, 'TOKEN CALLERID', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.strictEqual(mc.callerId, 'CALLERID');
    });
  });

  describe('#retrieveAccessFromId', () => {
    const username = 'USERNAME';
    const customAuthStep = null;

    let access: Object;
    let mc; let findOne; let
        storage;
    beforeEach(() => {
      mc = new MethodContext(username, 'TOKEN CALLERID', customAuthStep);

      access = {
        id: 'accessIdFromAccess',
        token: 'tokenFromAccess',
      };

      findOne = sinon.fake.yields(null, access);

      storage = {
        accesses: {
          findOne,
        },
      };
    });

    it('[OJW2] checks expiry of the access', async () => {
      access.expires = timestamp.now('-1d');

      let caught = false;
      try {
        // FLOW storage is a fake
        await mc.retrieveAccessFromId(storage, 'accessId');
      } catch (err) {
        caught = true;
      }

      assert.isTrue(caught);
    });
    it('[D0RZ] loads the access', async () => {
      // FLOW storage is a fake
      const result = await mc.retrieveAccessFromId(storage, 'accessId');

      assert.strictEqual(mc.accessToken, 'tokenFromAccess');
      assert.strictEqual(mc.access, result);
    });
  });
});
