// @flow

const LRU = require('lru-cache');
const bluebird = require('bluebird');

const storage = require('components/storage');

const { PendingUpdate } = require('./pending_updates');

import type { LRUCache } from 'lru-cache';
import type { Operation } from './controller';

// TODO logging

// Operation that flushes the update to MongoDB. 
// 
class Flush implements Operation {
  // The update to flush when calling #run. 
  update: PendingUpdate;
  
  // The connection to MongoDB.
  db: storage.StorageLayer;
  
  // User lookup (name -> id)
  users: UserRepository;
  
  constructor(update: PendingUpdate, db: storage.StorageLayer) {
    this.update = update; 
    this.db = db;
    
    this.users = new UserRepository(db); 
  }
  
  // Flushes the information in `this.update` to disk (MongoDB).
  // 
  async run(): Promise<true> {
    const update = this.update; 
    const request = update.request;
    const db = this.db; 
    
    // update.userId contains the user _name_. To be able to update, we must 
    // first load the user and resolve his id. 
    const users = this.users; 
    const user = await users.resolve(request.userId);

    const query = {
      id: request.eventId,
    };
    const updatedData = {
      modifiedBy: request.author, 
      modified: request.timestamp, 
    };
    await bluebird.fromCallback(
      cb => db.events.updateOne(user, query, updatedData, cb));
      
    return true;
  }
}

const USER_LOOKUP_CACHE_SIZE = 1000;

// Repository to help with looking up users by name. This class will hide a 
// cache to speed up these lookups and load MongoDB less. 
// 
class UserRepository {
  db: storage.StorageLayer;
  cache: LRUCache<string, User>;
  
  constructor(db: storage.StorageLayer) {
    this.db = db;
    
    this.cache = LRU({
      max: USER_LOOKUP_CACHE_SIZE
    });
  }
  
  async resolve(name: string): Promise<User> {
    const cache = this.cache;
  
    if (cache.has(name)) {
      const user = cache.get(name);
      if (user != null) return user;
      
      // NOTE Since the cache is bounded in size, we might have evicted the 
      //  user in the meantime. If no user is in cache, fall through to the 
      //  production path. 
      
      // FALL THROUGH
    }
    
    const user = await this.resolveFromDB(name);
    
    cache.set(name, user);
    
    return user; 
  }
  
  async resolveFromDB(name: string): Promise<User> {
    const db = this.db; 
    
    const query = { username: name };
    const options = {};
    
    const user = await bluebird.fromCallback(
      cb => db.users.findOne(query, options, cb));
      
    return user;
  }
}

type User = {
  id: string, 
}

module.exports = {
  Flush, 
  UserRepository,
};
