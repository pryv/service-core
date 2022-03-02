/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const { getUsersRepository } = require('business/src/users');
const { PendingUpdate } = require('./pending_updates');

import type { Operation }  from './controller';

const { getMall } = require('mall');
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('hfs:flush');

// Operation that flushes the update to MongoDB. 
// 
class Flush implements Operation {
  
  // The update to flush when calling #run. 
  update: PendingUpdate;

  
  constructor(update: PendingUpdate) {
    this.update = update; 
  }
  
  // Flushes the information in `this.update` to disk (MongoDB).
  // 
  async run(): Promise<true> {
    const update = this.update; 
    const request = update.request;
    
    logger.debug(`Flushing update to ${request.userId}/${request.eventId}, author ${request.author}`);
    // update.userId contains the user _name_. To be able to update, we must 
    // first load the user and resolve his id. 

    const usersRepository = await getUsersRepository();
    const userId = await usersRepository.getUserIdForUsername(request.userId);
   
    // NOTE We choose to update fields using $set (for the most) and $min/$max
    // for the dataset  extent. This means we might _not_ change anything but
    // overwrite modified/modifiedBy all the same. 
    // 
    // The alternative would be load/modify/store here. That would be racy too, 
    // possibly destroying duration in the process. 
    // 
    // The chosen option at least leaves duration correct.

   
    const { from, to } = request.dataExtent;
   
    // first get event... because we need it's current time 
    // we could optimze here if the call sent the time of the event.. or use agregate call of mongo
    const mall = await getMall(); // too bad we cannot easily pass mall here 
    const originalEvent = await mall.events.getOne(userId, request.eventId);
    if (originalEvent.duration == null || to > originalEvent.duration) { // update only if needed.
      const updatedData = {
        duration: to,
        modifiedBy: request.author, 
        modified: request.timestamp,
      };
      // ADD AUDIT HERE ??

      // when changing for mall remove all reference to DB 
      await mall.events.updateFieldsWithOriginal(userId, originalEvent, updatedData);      
    } 

    return true;
  }
}

module.exports = {
  Flush, 
};
