/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const LRU = require('lru-cache');
const bluebird = require('bluebird');

const storage = require('storage');
const UserRepo = require('business/src/users/repository');
const { PendingUpdate } = require('./pending_updates');

import type { LRUCache }  from 'lru-cache';
import type { Operation }  from './controller';

// Operation that flushes the update to MongoDB. 
// 
class Flush implements Operation {
  logger; 
  
  // The update to flush when calling #run. 
  update: PendingUpdate;
  
  // The connection to MongoDB.
  db: storage.StorageLayer;
  
  // User lookup (name -> id)
  users: UsersRepository;
  
  constructor(update: PendingUpdate, db: storage.StorageLayer, logger) {
    this.update = update; 
    this.db = db;
    this.logger = logger; 
    
    this.users = new UsersRepository(db);     
  }
  
  // Flushes the information in `this.update` to disk (MongoDB).
  // 
  async run(): Promise<true> {
    const update = this.update; 
    const request = update.request;
    const db = this.db; 
    const logger = this.logger; 
    
    logger.debug(`Flushing update to ${request.userId}/${request.eventId}, author ${request.author}`);
    // update.userId contains the user _name_. To be able to update, we must 
    // first load the user and resolve his id. 

    const users = this.users; 
    const user = await users.resolve(request.userId);
    
    // NOTE We choose to update fields using $set (for the most) and $min/$max
    // for the dataset  extent. This means we might _not_ change anything but
    // overwrite modified/modifiedBy all the same. 
    // 
    // The alternative would be load/modify/store here. That would be racy too, 
    // possibly destroying duration in the process. 
    // 
    // The chosen option at least leaves duration correct.

    const query = {
      id: request.eventId,
    };
    const { from, to } = request.dataExtent;
   
    const updatedData = {
      // $min: { 'content.earliest': from }, -> Removed features
      $max: { duration: to },
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
class UsersRepository {
  db: storage.StorageLayer;
  cache: LRUCache<string, User>;
  businessRepository: UserRepo;
  
  constructor(db: storage.StorageLayer) {
    this.db = db;
    
    this.cache = LRU({
      max: USER_LOOKUP_CACHE_SIZE
    });
    this.businessRepository = new UserRepo(this.db.events);
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
  
  /**
   * get user information by the username
   * @param string name 
   */
  async resolveFromDB (name: string): Promise<User> {
    const user = await this.businessRepository.getAccountByUsername(name, true);
    return user;
  }
}

type User = {
  id: string, 
}

module.exports = {
  Flush, 
  UsersRepository,
};
