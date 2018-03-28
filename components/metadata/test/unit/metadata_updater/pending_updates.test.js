// @flow

// Tests for the PendingUpdatesMap and its helper classes. 

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert;
const sinon = require('sinon');

const { PendingUpdatesMap, PendingUpdate } = 
  require('../../../src/metadata_updater/pending_updates');

describe('PendingUpdatesMap', () => {
  describe('#merge and #get', () => {
    let map: PendingUpdatesMap;
    beforeEach(() => {
      map = new PendingUpdatesMap(); 
    });
    
    const now = new Date() / 1e3; 
    const update1: PendingUpdate = PendingUpdate.fromUpdateRequest({
      userId: 'user', 
      eventId: 'event', 
      
      author: 'token1', 
      timestamp: now, 
      dataExtent: {
        from: now - 100, 
        to: now, 
      }
    });
    const update2: PendingUpdate = PendingUpdate.fromUpdateRequest({
      userId: 'user', 
      eventId: 'event', 
      
      author: 'token2', 
      timestamp: now+10, 
      dataExtent: {
        from: now - 200, 
        to: now - 20, 
      }
    });
    
    it('stores updates', () => {
      map.merge(update1); 
      const value = map.get(update1.key());
      
      if (value == null) 
        throw new Error('Should not be null.');
        
      assert.deepEqual(value, update1);
    });
    it('merges updates with preexisting updates via #merge', () => {
      sinon.stub(update1, 'merge'); 
      
      map.merge(update1);
      map.merge(update2);

      sinon.assert.calledOnce(update1.merge);
      sinon.assert.calledWith(update1.merge, update2);
    });
  });
});

describe('PendingUpdate', () => {
  describe('#merge', () => {
    const now = new Date() / 1e3; 
    
    let update1: PendingUpdate;
    beforeEach(() => {
      update1 = PendingUpdate.fromUpdateRequest({
        userId: 'user', 
        eventId: 'event', 
        
        author: 'token1', 
        timestamp: now, 
        dataExtent: {
          from: now - 100, 
          to: now - 20, 
        }
      });
    });
    let update2: PendingUpdate;
    beforeEach(() => {
      update2 = PendingUpdate.fromUpdateRequest({
        userId: 'user', 
        eventId: 'event', 

        author: 'token2', 
        timestamp: now+10, 
        dataExtent: {
          from: now - 200, 
          to: now, 
        }
      });
    });
    
    it('constructively merges two updates', () => {
      update1.deadline = now + 30; 
      update2.deadline = now + 20;
      
      update1.merge(update2);
      
      const req1 = update1.request;
      assert.strictEqual(req1.userId, 'user');
      assert.strictEqual(req1.eventId, 'event');
      
      // update2 is later (timestamp), and thus this is the last author
      assert.strictEqual(req1.author, 'token2');
      assert.approximately(req1.timestamp, now + 10, 1);
      
      // dataExtent is merged by widening the range covered as far as possible. 
      assert.approximately(req1.dataExtent.from, now-200, 1, 
        'update2 covers more of the past, and thus wins for from');
      assert.approximately(req1.dataExtent.to, now, 1, 
        'update1 covers more in the present and wins');
      
      assert.approximately(update1.deadline, now + 20, 1, 'earlier deadline wins');
    });
    it('fails when key is not equal', () => {
      const failing: PendingUpdate = PendingUpdate.fromUpdateRequest({
        userId: 'user - no match', 
        eventId: 'event', 
        
        author: 'token1', 
        timestamp: now, 
        dataExtent: {
          from: now - 100, 
          to: now, 
        }
      });
      
      assert.throws(() => update1.merge(failing));
    });
  });
});