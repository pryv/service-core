var BaseStorage = require('./BaseStorage'),
    converters = require('./../converters'),
    timestamp = require('unix-timestamp'),
    util = require('util'),
    _ = require('lodash'),
    ApplyEventsFromDbStream = require('./../ApplyEventsFromDbStream');

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
function Events(database) {
  Events.super_.call(this, database);

  _.extend(this.converters, {
    itemDefaults: [converters.createIdIfMissing],
    itemToDB: [endTimeToDB, converters.deletionToDB, converters.stateToDB, streamIdsToDB],
    updateToDB: [
      endTimeUpdate,
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData')
    ],
    itemFromDB: [clearEndTime, converters.deletionFromDB, streamIdsFromDB],
  });

  this.defaultOptions = {
    sort: { time: -1 },
  };
}
util.inherits(Events, BaseStorage);

function endTimeToDB(eventData) {
  if (eventData.hasOwnProperty('duration') && eventData.duration !== 0) {
    eventData.endTime = getEndTime(eventData.time, eventData.duration);
  }
  return eventData;
}

function endTimeUpdate(update) {
  if (update.$set.hasOwnProperty('duration')) {
    if (update.$set.duration === 0) {
      update.$unset.endTime = 1;
    } else {
      update.$set.endTime = getEndTime(update.$set.time, update.$set.duration);
    }
  }
  return update;
}

function getEndTime(time, duration) {
  if (duration === null) {
    // running period event; HACK: end time = event time + 1000 years
    return timestamp.add(time, 24 * 365 * 1000);
  } else {
    // finished period event
    return time + duration;
  }
}

function clearEndTime(event) {
  if (!event) {
    return event;
  }
  delete event.endTime;
  return event;
}


// #streamIds -- Should be removed at the end (Simple intergrity check)
function streamIdsToDB(event) {
  if (!event) {
    return event;
  }
  if (event.streamId && event.streamIds) {
    if (event.streamIds.length > 1 || event.streamIds[0] !== event.streamId) {
      console.log("******** ZUT", event);
      throw new Error("Cannot mix different streamIds and streamId properties");
    }
    delete event.streamId;
  } 
  if (event.streamId) {
    console.warn("Still cleaning some events IN");
    event.streamIds = [event.streamId];
    delete event.streamId;
  }
  return event;
}

// #streamIds
function streamIdsFromDB(event) {
  if (!event) {
    return event;
  }
  if (event.streamId) {
    console.log("******** ZUT 2", event);
    throw new Error("I should not find anymore event with streamId");
  }
  if (event.streamIds && event.streamIds.length > 0 ) {
    event.streamId = event.streamIds[0];
  }
  
  return event;
}

// TODO: review indexes against 1) real usage and 2) how Mongo actually uses them
var indexes = [
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
  },
];

/**
 * Implementation.
 */
Events.prototype.getCollectionInfo = function(user) {
  return {
    name: 'events',
    indexes: indexes,
    useUserId: user.id
  };
};

/**
 * Implementation
 */
Events.prototype.findStreamed = function(user, query, options, callback) {
  query.deleted = null;
  // Ignore history of events for normal find.
  query.headId = null;

  this.database.findStreamed(
    this.getCollectionInfo(user),
    this.applyQueryToDB(query),
    this.applyOptionsToDB(options),
    function(err, dbStreamedItems) {
      if (err) {
        return callback(err);
      }
      callback(null, dbStreamedItems.pipe(new ApplyEventsFromDbStream()));
    }.bind(this)
  );
};

/**
 * Implementation
 */
Events.prototype.findHistory = function(user, headId, options, callback) {
  this.database.find(
    this.getCollectionInfo(user),
    this.applyQueryToDB({ headId: headId }),
    this.applyOptionsToDB(options),
    function(err, dbItems) {
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
Events.prototype.findDeletionsStreamed = function(
  user,
  deletedSince,
  options,
  callback
) {
  var query = { deleted: { $gt: timestamp.toDate(deletedSince) } };
  this.database.findStreamed(
    this.getCollectionInfo(user),
    query,
    this.applyOptionsToDB(options),
    function(err, dbStreamedItems) {
      if (err) {
        return callback(err);
      }
      callback(null, dbStreamedItems.pipe(new ApplyEventsFromDbStream()));
    }.bind(this)
  );
};

Events.prototype.countAll = function(user, callback) {
  this.count(user, {}, callback);
};

Events.prototype.insertOne = function (user, event, callback) {
  Events.super_.prototype.insertOne.call(this, user, streamIdsToDB(event), callback);
};

Events.prototype.updateOne = function (user, query, updatedData, callback) {
  Events.super_.prototype.updateOne.call(this, user, query, streamIdsToDB(updatedData), callback);
};

/**
 * Implementation
 */
Events.prototype.minimizeEventsHistory = function(user, headId, callback) {
  var update = {
    $unset: {
      streamId: 1,
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
    this.getCollectionInfo(user),
    this.applyQueryToDB({ headId: headId }),
    update,
    callback
  );
};

/* jshint -W024 */
/**
 * Implementation.
 */
Events.prototype.delete = function(user, query, deletionMode, callback) {
  // default
  var update = {
    $set: { deleted: new Date() },
  };

  switch (deletionMode) {
    case 'keep-nothing':
      update.$unset = {
        streamId: 1,
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
        streamId: 1,
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
    this.getCollectionInfo(user),
    this.applyQueryToDB(query),
    update,
    callback
  );
};
