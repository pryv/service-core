// @flow

// Code related to bookkeeping for pending updates. Will probably move. 

import type { IUpdateRequest, IUpdateId } from './interface';

type EpochTime = number; // in seconds

class PendingUpdatesMap {
  // Currently pending updates. 
  map: Map<PendingUpdateKey, PendingUpdate>; 
  
  constructor() {
    this.map = new Map(); 
  }
  
  // Merges the `update` into the map, so that in the end, the data in `update`
  // is represented by our next update. See design document (HF Pryv) on how
  // updates are  merged in detail.  
  // 
  // The collection takes ownership of the `update` parameter, meaning it may 
  // well modify it down the line. 
  // 
  merge(update: PendingUpdate) {
    const map = this.map; 
    
    const key = update.key(); 
    if (map.has(key)) {
      const existing = map.get(key);
      if (existing == null) throw new Error('AF: existing cannot be null');
      
      existing.merge(update);
    }
    else {
      map.set(update.key(), update);
    }
  }
  
  // Returns a pending update stored under `key` if such an update exists 
  // currently. 
  // 
  get(key: PendingUpdateKey): ?PendingUpdate {
    const map = this.map; 

    return map.get(key) || null;
  }

  // Returns the amount of updates the map stores.
  // 
  size(): number {
    return this.map.size;
  }
  
  // Using the heap index, return all the updates that are past their deadline. 
  // Ownership passes to the caller; the updates are deleted from all internal
  // structures. 
  // 
  getElapsed(): Array<PendingUpdate> {
    return [];
  }
}

type UpdateStruct = {
  userId: string,  // user name
  eventId: string, // event id
  author: string, // token
  timestamp: EpochTime, // when was the update made
  dataExtent: {
    from: EpochTime, // lowest update timestamp
    to: EpochTime, // highest update timestamp
  }
};

opaque type PendingUpdateKey = string;

const STALE_LIMIT = 5 * 60;

class PendingUpdate {
  request: UpdateStruct;
  
  deadline: EpochTime; // time from epoch, in seconds
  
  static fromUpdateRequest(req: IUpdateRequest): PendingUpdate {
    return new PendingUpdate(req);
  }
  static key(id: IUpdateId): PendingUpdateKey {
    return key(id.userId, id.eventId);
  }
  
  constructor(req: UpdateStruct) {
    this.request = req; // flow has got our back here...
    
    this.deadline = (new Date() / 1e3) + STALE_LIMIT;
  }
  
  key(): PendingUpdateKey {
    const request = this.request; 
    return key(request.userId, request.eventId);
  }
  
  // Merges two pending updates for a given key. Merges are done according 
  // to the meaning of each update field; for example the update that is 
  // later will determine the update author. This method modifies this. 
  // 
  merge(other: PendingUpdate) {
    if (this.key() !== other.key()) 
      throw new Error('Attempting update with data for a different series.');
    
    // The later update wins for timestamp and author
    const ts = (e: PendingUpdate) => e.request.timestamp;
    const later = [this, other]
      .sort((a, b) => ts(a) - ts(b))[1];
      
    const request = this.request;
    const latReq  = later.request; 
    request.author = latReq.author;
    request.timestamp = ts(later);
    
    // Take the union of the two dataExtents. 
    const dataExtent = request.dataExtent;
    const otherExtent = other.request.dataExtent;
    dataExtent.from = Math.min(dataExtent.from, otherExtent.from);
    dataExtent.to = Math.max(dataExtent.to, otherExtent.to); 
    
    // Earliest deadline wins.
    this.deadline = Math.min(this.deadline, other.deadline);
  }
}

function key(a: string, b: string): PendingUpdateKey {
  return [a, b].join('/');
}

module.exports = {
  PendingUpdatesMap, 
  PendingUpdate
};