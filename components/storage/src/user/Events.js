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
  eventData.integrity = integrity.forEvent(eventData).integrity; 
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

 

  let cb = callback;
  if (! integrity.isActiveFor.events) {
    // unset eventually existing integrity field.
    if (! update.$unset) update.$unset = {};
    update.$unset.intergrity = 1;
  } else {
    cb = function callbackIntegrity(err, eventData) {
      if ((! integrity.isActiveFor.events) || err || (eventData.id == null)) return callback(err, eventData);
  
      const integrityCheck = eventData.integrity;
      try { 
        eventData.integrity = integrity.forEvent(eventData).integrity;
      } catch (errIntegrity) {
        return callback(errIntegrity, eventData);
      }
  
      if (integrityCheck != eventData.integrity) {
        // could be optimized by using "updateOne" instead of findOne and update
        return Events.super_.prototype.findOneAndUpdate.call(that, userOrUserId, {_id: eventData.id}, {integrity: eventData.integrity}, callback);
      } 
      callback(err, eventData);
    }
  }

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
  const that = this;
  //if (! integrity.isActiveFor.events) {
    // unset eventually existing integrity field.
    if (! update.$unset) update.$unset = {};
    update.$unset.integrity = 1;
  //} 
  console.log('EVENT updateMany', query, 'U:', update)

  Events.super_.prototype.updateMany.call(this, userOrUserId, query, update, callback);
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

  this.database.updateMany(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB({ headId: headId }),
    update,
    callback
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

  let finalCallBack = callback;
  if (integrity.isActiveFor.events) {
    const integrityBatchCode = Math.random();
    update.$set.integrityBatchCode = integrityBatchCode;
    finalCallBack = getResetIntegrity(this, userOrUserId, integrityBatchCode, callback);
  }

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
  console.log('XXXX delete', update);



  this.database.updateMany(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query),
    update,
    finalCallBack
  );
};

function getResetIntegrity(eventStore, userOrUserId, integrityBatchCode, callback) {
  console.log('RESET GIVEN FOR ', integrityBatchCode);
  return function(err, res) {
    if (err) return callback(err);

    function updateIfNeeded(event) {
      console.log('XXXXX updateIfNeeded', event);
      return {
        $unset: { integrityBatchCode: 1},
        $set: {
          integrity: integrity.forEvent(event).integrity
        }
      }
    }

    function doneCallBack(err2, res) {
      if (err2) return callback(err2);
      console.log('XXXXX RRRRRRRR', res);
      return callback(err2, res);
      // check number of changed items 
    }

    eventStore.findAndUpdateIfNeeded(userOrUserId, {integrityBatchCode: integrityBatchCode}, {}, updateIfNeeded, doneCallBack);
  }
}