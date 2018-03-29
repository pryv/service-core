// @flow

// A test for the flush operation that flushes updates to disk. 

/* global describe, it, beforeEach */

const { PendingUpdate } = 
  require('../../../src/metadata_updater/pending_updates');
const { Flush } = require('../../../src/metadata_updater/flush');

describe('Flush', () => {
  let op: Flush; 
  
  beforeEach(() => {
    const now = new Date() / 1e3;
    const update = makeUpdate(now); 
    op = new Flush(update);
  });
  
  it('writes event metadata to disk');
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

