
// @flow

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 

const Settings = require('../../src/settings');

describe('Settings', () => {
  describe('#getLogSettingsObject', () => {
    let settings; 
    beforeEach(() => {
      settings = new Settings(); 
    });
    
    it('returns a settings object for the log subsystem', () => {
      const logSettings = settings.getLogSettingsObject();
      assert.isTrue(logSettings.console.active);
    });
  });
});