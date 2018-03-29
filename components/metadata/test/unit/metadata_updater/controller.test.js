// @flow

// Tests the Metadata Updater Controller. 

/* global describe, it, beforeEach, afterEach */

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

const awaiting = require('awaiting');

const { Controller } = require('../../../src/metadata_updater/controller');

describe('Metadata Updater/Controller', () => {
  let controller: Controller; 
  beforeEach(() => {
    controller = new Controller(); 
  });
  afterEach(() => {
    controller.stop(); 
  });
  
  describe('runEach(ms)', () => {
    it('starts a timer and runs #act every n ms', async () => {
      sinon.stub(controller, 'act');
      
      controller.runEach(10);
      
      // wait for 15ms, which should run act twice, once immediately and once
      // after 10ms. 
      await awaiting.delay(25);
      
      sinon.assert.callCount(controller.act, 2);
    });
  });
});