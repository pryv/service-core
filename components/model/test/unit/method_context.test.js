// @flow

/* global describe, it */

const chai = require('chai');
const assert = chai.assert; 

const MethodContext = require('../../src/MethodContext');

describe('MethodContext', () => {
  describe('parseAuth', () => {
    const username = 'USERNAME';
    const customAuthStep = null; 
    
    it('should parse token out', () => {
      const mc = new MethodContext(username, 'TOKEN', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.isNull(mc.callerId);
    });
    it('should also parse the callerId when available', () => {
      const mc = new MethodContext(username, 'TOKEN CALLERID', customAuthStep);
      assert.strictEqual(mc.accessToken, 'TOKEN');
      assert.strictEqual(mc.callerId, 'CALLERID');
    });
  });
});

