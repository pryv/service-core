var BaseStorage = require('./BaseStorage'),
    converters = require('./../converters'),
    timestamp = require('unix-timestamp'),
    util = require('util'),
    _ = require('lodash');

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
    itemToDB: [
      endTimeToDB,
      converters.deletionToDB,
      converters.stateToDB
    ],
    updateToDB: [
      endTimeUpdate,
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData')
    ],
    itemFromDB: [
      clearEndTime,
      converters.deletionFromDB
    ]
  });

  this.defaultOptions = {
    fields: {},
    sort: {time: -1}
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
  if (! event) { return event; }
  delete event.endTime;
  return event;
}

// TODO: review indexes against 1) real usage and 2) how Mongo actually uses them
var indexes = [
  {
    index: {time: 1},
    options: {}
  },
  {
    index: {streamId: 1},
    options: {}
  },
  {
    index: {tags: 1},
    options: {}
  },
  // no index by content until we have more actual usage feedback
  {
    index: {trashed: 1},
    options: {}
  },
  {
    index: {modified: 1},
    options: {}
  },
  {
    index: {deleted: 1},
    options: {
      // cleanup deletions after a year
      expireAfterSeconds: 3600 * 24 * 365
    }
  }
];

/**
 * Implementation.
 */
Events.prototype.getCollectionInfo = function (user) {
  return {
    name: user.id + '.events',
    indexes: indexes
  };
};

Events.prototype.countAll = function (user, callback) {
  this.count(user, {}, callback);
};

/* jshint -W024 */
/**
 * Implementation.
 */
Events.prototype.delete = function (user, query, deletionMode, callback) {
  // default
  var update = {
    $set: {deleted: new Date()}
  };

  switch (deletionMode) {
  case 'keep-nothing':
    update.$unset = {
      streamId: 1,
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
      modifiedBy: 1
    };
    break;
  case 'keep-authors':
    update.$unset = {
      streamId: 1,
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
      createdBy: 1
    };
    break;
  }
  this.database.update(this.getCollectionInfo(user), this.applyQueryToDB(query), update, callback);
};
