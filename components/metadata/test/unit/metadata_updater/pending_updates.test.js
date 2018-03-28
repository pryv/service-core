// @flow

// Tests for the PendingUpdatesMap and its helper classes. 

/* global describe, it, beforeEach */

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
      
      author: 'token', 
      timestamp: now, 
      dataExtent: {
        from: now - 100, 
        to: now, 
      }
    });
    
    it('stores updates', () => {
      map.merge(update1); 
      const value = map.get(update1.key());
      
      if (value == null) 
        throw new Error('Should not be null.');
    });
    it('merges updates with preexisting updates via #merge', () => {
      
    });
  });
});