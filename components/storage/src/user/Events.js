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
    ],
    itemsToDB: [
      function (items) { 
        if (items == null) return null;  
        const res = items.map(e => converters.stateToDB(converters.deletionToDB(durationToEndTime(e)))); 
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

function durationToEndTime (eventData) {
  if (eventData.endTime !== undefined) {
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
  throw new Error('Deprecated, use mall.events.delete()');
};

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
    throw new Error('Deprecated, use mall.events.create()');
  };

