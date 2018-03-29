// @flow

// Tests the Metadata Updater Controller. 

/* global describe, it, beforeEach, afterEach */

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

const awaiting = require('awaiting');

const { PendingUpdate, PendingUpdatesMap } = 
  require('../../../src/metadata_updater/pending_updates');
const { Controller } = require('../../../src/metadata_updater/controller');

describe('Metadata Updater/Controller', () => {
  let map: PendingUpdatesMap;
  let controller: Controller; 
  beforeEach(() => {
    map = new PendingUpdatesMap();
    controller = new Controller(map); 
  });
  afterEach(() => {
    controller.stop(); 
  });
  
  describe('#runEach(ms)', () => {
    it('starts a timer and runs #act every n ms', async () => {
      sinon.stub(controller, 'act');
      
      controller.runEach(10);
      
      // wait for 15ms, which should run act twice, once immediately and once
      // after 10ms. 
      await awaiting.delay(25);
      
      sinon.assert.callCount(controller.act, 2);
    });
  });
  describe('#flushOp(update)', () => {
    it('constructs an Flush operation for the update and returns it'); 
  });
  describe('#act', () => {
    const now = new Date() / 1e3;
    
    // Stores two 'update's in the `map`.
    beforeEach(() => {
      map.merge( makeUpdate(now - 10*60, { eventId: 'event1' }) );
      map.merge( makeUpdate(now - 10*60, { eventId: 'event2' }) );
    });
    
    it('pulls elapsed updates and flushes them to MongoDB', async () => {
      const flushOps = [];
      
      // Stub out the flushOp producer
      const flushOp = sinon.stub(controller, 'flushOp');
      flushOp.callsFake(() => {
        const op = sinon.spy(); 
        flushOps.push(op);
        
        return { run: op };
      });
      
      controller.act(); 
      
      assert.strictEqual(flushOps.length, 2);
      for (const op of flushOps) {
        await sinon.assert.calledOnce(op);
      }
    }); 
  });
});

function makeUpdate(now: number, attrs: UpdateAttrs={}): PendingUpdate {
  const myAttrs = {
    userId: attrs.userId || 'user', 
    eventId: attrs.eventId || 'event', 
    
    author: attrs.author || 'token1', 
    timestamp: attrs.timestamp || now, 
    dataExtent: {
      from: attrs.from || (now - 100), 
      to: attrs.to || now, 
    }
  };
  
  return PendingUpdate.fromUpdateRequest(now, myAttrs);
}
type UpdateAttrs = {
  from?: number, 
  to?: number, 
  timestamp?: number, 
  author?: string, 
  userId?: string, 
  eventId?: string, 
};

