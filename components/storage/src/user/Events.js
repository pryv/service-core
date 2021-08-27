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
      updateIntegrity,
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
  if (! integrity.isActive) return ;
  eventData.integrity = integrity.forEvent(eventData).integrity; 
  return eventData;
}

function updateIntegrity (a, b, c) {
  //console.log('XXX Update integrity', a, b, c);
  return a;
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
      };
      break;
  }

  this.database.updateMany(
    this.getCollectionInfo(userOrUserId),
    this.applyQueryToDB(query),
    update,
    callback
  );
};