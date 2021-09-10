/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
      endTimeToDB,
      converters.deletionToDB,
      converters.stateToDB,
      addIntegrity,
    ],
    itemsToDB: [
      function (items) { 
        if (items == null) return null;  
        const res = items.map(addIntegrity); 
        return res;
      }
    ],
    updateToDB: [
      endTimeUpdate,
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData'),
    ],
    itemFromDB: [
      clearEndTime,
      converters.deletionFromDB,
    ],
  });

  this.defaultOptions = {
    sort: { time: -1 },
  };
}
util.inherits(Events, BaseStorage);

function addIntegrity (eventData) {
  if (! integrity.isActiveFor.events) return ;
  integrity.setOnEvent(eventData); 
  return eventData;
}

function endTimeToDB (eventData) {
  if (eventData.hasOwnProperty('duration') && eventData.duration !== 0) {
    eventData.endTime = getEndTime(eventData.time, eventData.duration);
  }
  return eventData;
}

function endTimeUpdate (update) {
  if (update.$set.hasOwnProperty('duration')) {
    if (update.$set.duration === 0) {
      update.$unset.endTime = 1;
    } else {
      update.$set.endTime = getEndTime(update.$set.time, update.$set.duration);
    }
  }
  return update;
}

function getEndTime (time, duration) {
  if (duration === null) {
    // running period event; HACK: end time = event time + 1000 years
    return timestamp.add(time, 24 * 365 * 1000);
  } else {
    // finished period event
    return time + duration;
  }
}

function clearEndTime (event) {
  if (!event) {
    return event;
  }
  delete event.endTime;
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
Events.prototype.updateOne = function (userOrUserId, query, update, callback) {
  const that = this;
  
  // unset eventually existing integrity field. Unless integrity is in set request
  if (update.integrity == null && update.$set?.integrity == null) {
    if (! update.$unset) update.$unset = {};
    update.$unset.integrity = 1;
  }

  let cb = callback;
  if (integrity.isActiveFor.events) {
    cb = function callbackIntegrity(err, eventData) {
      if (err || (eventData.id == null)) return callback(err, eventData);
  
      const integrityCheck = eventData.integrity;
      try { 
        eventData.integrity = integrity.forEvent(eventData).integrity;
      } catch (errIntegrity) {
        return callback(errIntegrity, eventData);
      }
      
      // only update if there is a mismatch of integrity
      if (integrityCheck != eventData.integrity) {
        // could be optimized by using "updateOne" instead of findOne and update
        return Events.super_.prototype.findOneAndUpdate.call(that, userOrUserId, {_id: eventData.id}, {integrity: eventData.integrity}, callback);
      } 
      callback(err, eventData);
    }
  }
  console.log('XXXXXX updateOne', update);
  Events.super_.prototype.findOneAndUpdate.call(this, userOrUserId, query, update, cb);
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
  query.deleted = null;
  // Ignore history of events for normal find.
  query.headId = null;

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
          .pipe(new ApplyEventsFromDbStream())
      );
    }.bind(this)
  );
};

/**
 * Implementation
 */
Events.prototype.findHistory = function (userOrUserId, headId, options, callback) {
  this.database.find(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB({ headId: headId }),
    this.applyOptionsToDB(options),
    function (err, dbItems) {
      console.log('XXXXXX findHistory', dbItems);
      if (err) {
        return callback(err);
      }
      callback(null, this.applyItemsFromDB(dbItems));
    }.bind(this)
  );
};

/**
 * Implementation
 */
Events.prototype.findDeletionsStreamed = function (
  userOrUserId,
  deletedSince,
  options,
  callback
) {
  var query = { deleted: { $gt: timestamp.toDate(deletedSince) } };
  this.database.findStreamed(
    this.getCollectionInfo(userOrUserId),
    query,
    this.applyOptionsToDB(options),
    function (err, dbStreamedItems) {
      if (err) {
        return callback(err);
      }
      callback(null, dbStreamedItems.pipe(new ApplyEventsFromDbStream()));
    }.bind(this)
  );
};

Events.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};

/**
 * Implementation
 */
Events.prototype.minimizeEventsHistory = function (userOrUserId, headId, callback) {
  var update = {
    $unset: {
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
    },
  };

  // if integrity for events in "ON" add extra check step after update
  const query = { headId: headId };
  let finalCallBack = getResetIntegrity(this, userOrUserId, update, callback);
  this.database.updateMany(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query),
    update,
    finalCallBack
  );
};

/* jshint -W024 */
/**
 * Implementation.
 */
Events.prototype.delete = function (userOrUserId, query, deletionMode, callback) {
  // default
  var update = {
    $set: { deleted: new Date() },
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
  let finalCallBack = getResetIntegrity(this, userOrUserId, update, callback);;
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
  if (! integrity.isActiveFor.events) return callback;

  // add a random "code" to the original update find out which events have been modified
  const integrityBatchCode = Math.random();
  // hard coded cases when syntax changes .. to be evaluated 
  if(update['streamIds.$'] != null || update.$pull != null) {
    update.integrityBatchCode = integrityBatchCode;
  } else {
    if (! update.$set) update.$set = {};
    update.$set.integrityBatchCode = integrityBatchCode;
  }


  console.log('XXXXXX update:', update);
  // return a callback that will be executed after the update
  // it 
  return function(err, res) {
    if (err) return callback(err);
    const initialModifiedCount = res.modifiedCount;

    // will be called for each updated item
    // we should remove the "integrityBatchCode" that helped finding them out 
    // and add the integrity value
    function updateIfNeeded(event) {
      delete event.integrityBatchCode; // remove integrity batch code for computation
      console.log('XXXXXX updateIfNeeded:', event);
      return {
        $unset: { integrityBatchCode: 1},
        $set: { integrity: integrity.forEvent(event).integrity}
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