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
  merge(update: PendingUpdate) {
    const map = this.map; 
    
    map.set(update.key(), update);
  }
  
  // Returns a pending update stored under `key` if such an update exists 
  // currently. 
  // 
  get(key: PendingUpdateKey): ?PendingUpdate {
    const map = this.map; 

    return map.get(key) || null;
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
}

function key(a: string, b: string): PendingUpdateKey {
  return [a, b].join('/');
}

module.exports = {
  PendingUpdatesMap, 
  PendingUpdate
};