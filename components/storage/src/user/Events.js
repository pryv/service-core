/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const BaseStorage = require('./BaseStorage');
const converters = require('./../converters');
const timestamp = require('unix-timestamp');
const util = require('util');
const _ = require('lodash');
const ApplyEventsFromDbStream = require('./../ApplyEventsFromDbStream');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const integrity = require('business/src/integrity');
const logger = require('@pryv/boiler').getLogger('storage:events');

module.exports = Events;
/**
 * DB persistence for events.
 *
 * Note: period events are stored with both `duration` (exposed publicly) and `endTime`.
 * `endTime` is a computed (`time` + `duration`), storage-only field absent from retrieved events.
 * Callers can (and should) make use of `endTime` to simplify and optimize their "find" queries.
 *
 * @param {Database} database
 * @constructor
 */
function Events (database) {
  Events.super_.call(this, database);

  SystemStreamsSerializer.getSerializer(); // TODO remove to load it correctly in tests

  _.extend(this.converters, {
    itemDefaults: [converters.createIdIfMissing],
    itemToDB: [
      durationToEndTime,
      converters.deletionToDB,
      converters.stateToDB,
      addIntegrity,
    ],
    itemsToDB: [
      function (items) { 
        if (items == null) return null;  
        const res = items.map(e => addIntegrity(converters.stateToDB(converters.deletionToDB(durationToEndTime(e))))); 
        return res;
      }
    ],
    updateToDB: [
      endTimeUpdate,
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData'),
    ],
    itemFromDB: [
      endTimeToDuration,
      converters.deletionFromDB,
    ],
    itemsFromDB: [
      function (items) { 
        if (items == null) return null;  
        const res = items.map(e => converters.deletionFromDB(endTimeToDuration(e))); 
        return res;
      }
    ],
  });

  this.defaultOptions = {
    sort: { time: -1 },
  };
}
util.inherits(Events, BaseStorage);

function addIntegrity (eventData) {
  if (! integrity.events.isActive) return eventData;
  integrity.events.set(eventData); 
  return eventData;
}

function durationToEndTime (eventData) {
  if (eventData.endTime !== undefined ) {
    //console.log('endTime should no be defined ', {id: eventData.id, endTime: eventData.endTime, duration: eventData.duration});
    return eventData;
  }
  if (eventData.duration === null) { // exactly null 
    eventData.endTime = null;
  } else if (eventData.duration === undefined) { // (no undefined)
    // event.time is not defined for deleted events
    if (eventData.time != null) eventData.endTime = eventData.time;
  } else { // defined
    eventData.endTime = eventData.time + eventData.duration;
  }
  delete eventData.duration;
  return eventData;
}


function endTimeUpdate (update) {
  if (update.$set) {
    if (update.$set.duration === null) {
      update.$set.endTime = null;
    } else if (update.$set.duration != null) { // (no undefined)
      if (update.$set.time == null) {
        throw (new Error('Cannot update duration without known the time' + JSON.stringify(update)));
      }
      update.$set.endTime = update.$set.time + update.$set.duration;
    }
    delete update.$set.duration ;
  }
  if (update.$unset) {
    if (update.$unset.duration != null) {
      delete update.$unset.duration;
      update.$unset.endTime = 1;
    }
  }

  return update;
}

function endTimeToDuration (event) {
  if (event == null) {
    return event;
  }
  if (event.endTime === null) {
    event.duration = null;
  } else if (event.endTime !== undefined) {
    const prevDuration = event.duration;
    event.duration = event.endTime - event.time;
    if (prevDuration != null && prevDuration != event.duration) {
      console.log('What !! ', new Error('Duration issue.. This should not thappen'));
    }
  }
  delete event.endTime;
  // force duration property undefined if 0
  if (event.duration === 0) { delete event.duration; }
  return event;
}

function getDbIndexes () {
  // TODO: review indexes against 1) real usage and 2) how Mongo actually uses them
  const indexes = [
    {
      index: { time: 1 },
      options: {},
    },
    {
      index: { streamIds: 1 },
      options: {},
    },
    {
      index: { tags: 1 },
      options: {},
    },
    {
      index: {integrityBatchCode: 1},
      options: {},
    },
    // no index by content until we have more actual usage feedback
    {
      index: { trashed: 1 },
      options: {},
    },
    {
      index: { modified: 1 },
      options: {},
    },
    {
      index: { endTime: 1 },
      options: { partialFilterExpression: { endTime: { $exists: true } } },
    }
  ];
  return indexes;
}


/**
 * Finds and updates atomically a single document matching the given query,
 * returning the updated document.
 * @param user
 * @param query
 * @param updatedData
 * @param callback
 */
Events.prototype.updateOne = function (userOrUserId, query, update, callback, options) {
  if ( ! stackContains('LocalUserEvents.js')) {
    $$('updateOne', userOrUserId, query, update);
    //throw new Error('updateOne should not be called outside LocalUserEvents.js');
  }
  const that = this;

  // unset eventually existing integrity field. Unless integrity is in set request
  if (update.integrity == null && update.$set?.integrity == null) {
    if (! update.$unset) update.$unset = {};
    update.$unset.integrity = 1;
  }

  let cb = callback;
  if (integrity.events.isActive) {
    cb = function callbackIntegrity(err, eventData) {
      if (err || (eventData?.id == null)) return callback(err, eventData);
  
      const integrityCheck = eventData.integrity;
      try { 
        integrity.events.set(eventData, true);
      } catch (errIntegrity) {
        return callback(errIntegrity, eventData);
      }
      // only update if there is a mismatch of integrity
      if (integrityCheck != eventData.integrity) {
        // could be optimized by using "updateOne" instead of findOne and update
        return Events.super_.prototype.findOneAndUpdate.call(that, userOrUserId, {_id: eventData.id}, {integrity: eventData.integrity}, callback, options);
      } 
      callback(err, eventData);
    }
  }
  Events.super_.prototype.findOneAndUpdate.call(this, userOrUserId, query, update, cb);
};

Events.prototype.updateOneRaw = function (userOrUserId, query, update, callback, options) {
  Events.super_.prototype.updateOne.call(this, userOrUserId, query, update, callback);
};


/**
 * Updates the one or multiple document(s) matching the given query.
 *
 * @param user
 * @param query
 * @param update
 * @param callback
*/
Events.prototype.updateMany = function (userOrUserId, query, update, callback) {
  const finalCallBack = getResetIntegrity(this, userOrUserId, update, callback);;
  Events.super_.prototype.updateMany.call(this, userOrUserId, query, update, finalCallBack);
};

/**
 * Implementation.
 */
Events.prototype.getCollectionInfo = function (userOrUserId) {
  const userId = this.getUserIdFromUserOrUserId(userOrUserId);
  return {
    name: 'events',
    indexes: getDbIndexes(),
    useUserId: userId
  };
};

Events.prototype.getCollectionInfoWithoutUserId = function () {
  return {
    name: 'events',
    indexes: getDbIndexes()
  };
};

/**
 * Implementation
 */
Events.prototype.findStreamed = function (userOrUserId, query, options, callback) {
  this.database.findStreamed(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query),
    this.applyOptionsToDB(options),
    function (err, dbStreamedItems) {
      if (err) {
        return callback(err);
      }
      callback(null,
        dbStreamedItems
          .pipe(new ApplyEventsFromDbStream(this.converters.itemFromDB))
      );
    }.bind(this)
  );
};

Events.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};


/* jshint -W024 */
/**
 * Implementation.
 */
Events.prototype.delete = function (userOrUserId, query, deletionMode, callback) {
  // default
  var update = {
    $set: { deleted: Date.now() / 1000 },
  };

  switch (deletionMode) {
    case 'keep-nothing':
      update.$unset = {
        streamIds: 1,
        time: 1,
        duration: 1,
        endTime: 1,
        type: 1,
        content: 1,
        tags: 1,
        description: 1,
        attachments: 1,
        clientData: 1,
        trashed: 1,
        created: 1,
        createdBy: 1,
        modified: 1,
        modifiedBy: 1,
        integrity: 1,
      };
      break;
    case 'keep-authors':
      update.$unset = {
        streamIds: 1,
        time: 1,
        duration: 1,
        endTime: 1,
        type: 1,
        content: 1,
        tags: 1,
        description: 1,
        attachments: 1,
        clientData: 1,
        trashed: 1,
        created: 1,
        createdBy: 1,
        integrity: 1
      };
      break;
    default: // keep everything
      update.$unset = {
        integrity: 1,
      }
      break;
  }
  // if integrity for events in "ON" add extra check step after update
  const finalCallBack = getResetIntegrity(this, userOrUserId, update, callback);
  this.database.updateMany(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query),
    update,
    finalCallBack
  );
};

/**
 * - Allways unset 'integrity' of updated events by modifiying update query
 * - If integrity is active for event returns a callBack to be exectued at after the update
 * @param {Events} eventStore 
 * @param {User | userId} userOrUserId 
 * @param {Object} upddate -- the update query to be modified
 * @param {*} callback 
 * @returns either the original callback or a process to reset events' integrity
 */
function getResetIntegrity(eventStore, userOrUserId, update, callback) {
  // anyway remove any integrity that might have existed
  if (! update.$unset) update.$unset = {};
  update.$unset.integrity = 1;

  // not active return the normal callback
  if (! integrity.events.isActive) return callback;

  // add a random "code" to the original update find out which events have been modified
  const integrityBatchCode = Math.random();
  // hard coded cases when syntax changes .. to be evaluated 
  if(update['streamIds.$'] != null || update.$pull != null) {
    update.integrityBatchCode = integrityBatchCode;
  } else {
    if (update.$set == null) update.$set = {};
    update.$set.integrityBatchCode = integrityBatchCode;
  }

  // return a callback that will be executed after the update
  return function integrityResetCallback(err, res) {
    if (err) return callback(err);
    const initialModifiedCount = res.modifiedCount;

    // will be called for each updated item
    // we should remove the "integrityBatchCode" that helped finding them out 
    // and add the integrity value
    function updateIfNeeded(event) {
      delete event.integrityBatchCode; // remove integrity batch code for computation
      const previousIntegrity = event.integrity;
      integrity.events.set(event, true);
      if (previousIntegrity == event.integrity) return null;
      return {
        $unset: { integrityBatchCode: 1},
        $set: { integrity: event.integrity}
      }
    }

    function doneCallBack(err2, res2) {
      if (err2) return callback(err2);
      if (res2.count != initialModifiedCount) { // updated documents counts does not match
        logger.error('Issue when adding integrity to updated events for ' + JSON.stringify(userOrUserId) + ' counts does not match');
        // eventually throw an error here.. But this will not help the API client .. 
        // to be discussed !
      }
      return callback(err2, res2);
    }
    
    eventStore.findAndUpdateIfNeeded(userOrUserId, {integrityBatchCode: integrityBatchCode}, {}, updateIfNeeded, doneCallBack);
  }
}

/**
 * Do not use!
 * @see mall.events.get()
 */
 Events.prototype.find = function (userOrUserId, query, options, callback) {
  throw new Error('Deprecated, use mall.events.get()');
  //Events.super_.prototype.find.call(this, userOrUserId, query, options, callback);
};

/**
 * Do not use!
 * @see mall.events.getOne()
 */
 Events.prototype.findOne = function (userOrUserId, query, options, callback) {
    throw new Error('Deprecated, use mall.events.getOne() or .get()');
 };

 /**
 * Reserved for LocalStoreUser use only mall.events.create();
 * @see mall.events.create()
 */
  Events.prototype.insertMany = function (userOrUserId, items, callback, options) {
    if ( ! stackContains('LocalUserEvents.js')) {
      $$('insertMany', userOrUserId, items, callback);
      //throw new Error();
    }
    Events.super_.prototype.insertMany.call(this, userOrUserId, items, callback, options);
  };

/**
 * Reserved for LocalStoreUser use only mall.events.create();
 * @see mall.events.create()
 */
 Events.prototype.insertOne = function (userOrUserId, item, callback, options) {
  if ( ! stackContains('LocalUserEvents.js')) {
    $$('insertOne', userOrUserId, item, callback);
    //throw new Error();
  }
  Events.super_.prototype.insertOne.call(this, userOrUserId, item, callback, options);
};

function stackContains(needle) {
  const e = new Error();
  const stack = e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 ).slice(1, 25);
  return stack.some(l =>  l.indexOf(needle) >= 0);
}