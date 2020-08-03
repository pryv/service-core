/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var BaseStorage = require('./BaseStorage'),
  converters = require('./../converters'),
  timestamp = require('unix-timestamp'),
  util = require('util'),
  _ = require('lodash'),
  bluebird = require('bluebird'),
  ApplyEventsFromDbStream = require('./../ApplyEventsFromDbStream'),
  UserInfoSerializer = require('components/business/src/user/user_info_serializer'),
  encryption = require('components/utils').encryption;

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

  _.extend(this.converters, {
    itemDefaults: [converters.createIdIfMissing],
    itemToDB: [endTimeToDB, converters.deletionToDB, converters.stateToDB],
    updateToDB: [
      endTimeUpdate,
      converters.stateUpdate,
      converters.getKeyValueSetUpdateFn('clientData')
    ],
    itemFromDB: [clearEndTime, converters.deletionFromDB],
  });

  this.defaultOptions = {
    sort: { time: -1 },
  };
}
util.inherits(Events, BaseStorage);

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
Events.prototype.getCollectionInfo = function (user) {
  return {
    name: 'events',
    indexes: indexes,
    useUserId: user.id
  };
};

/**
 * Implementation
 */
Events.prototype.findStreamed = function (user, query, options, callback) {
  query.deleted = null;
  // Ignore history of events for normal find.
  query.headId = null;

  this.database.findStreamed(
    this.getCollectionInfo(user),
    this.applyQueryToDB(query),
    this.applyOptionsToDB(options),
    function (err, dbStreamedItems) {
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
Events.prototype.findHistory = function (user, headId, options, callback) {
  this.database.find(
    this.getCollectionInfo(user),
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
Events.prototype.minimizeEventsHistory = function (user, headId, callback) {
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
Events.prototype.delete = function (user, query, deletionMode, callback) {
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
    this.getCollectionInfo(user),
    this.applyQueryToDB(query),
    update,
    callback
  );
};
/**
 * Form user information retrieved from the events
 */
Events.prototype.getUserInfo = async function ({ user, getAll }) {

  // get user details
  try {
    let userInfoSerializer = await UserInfoSerializer.build();
    // get streams ids from the config that should be retrieved
    const whatStreamsToRetrieve = getAll ? UserInfoSerializer.getAllCoreStreams() : UserInfoSerializer.getReadableCoreStreams();
    let userProfileStreamsIds = userInfoSerializer.getCoreStreams(whatStreamsToRetrieve);
    //console.log(whatStreamsToRetrieve, 'whatStreamsToRetrieve', userProfileStreamsIds,'userProfileStreamsIds');
    // form the query
    let query = { "streamIds": { '$in': Object.keys(userProfileStreamsIds) } };

    // IEVA TODO TO prototype?
    const dbItems = await bluebird.fromCallback(cb => this.database.find(
      this.getCollectionInfo(user),
      this.applyQueryToDB(query),
      this.applyOptionsToDB({}),
      cb));
    const userProfileEvents = this.applyItemsFromDB(dbItems);

    // convert events to the account info structure
    return userInfoSerializer.serializeEventsToAccountInfo(userProfileEvents);
  } catch (error) {
    throw error;
  }
};

/**
 * Get user id from username
 */
Events.prototype.getUserIdByUsername = async function (username): integer {
  // get user id 
  try {
    // TODO IEVA validate for deleted users
    const collectionInfo = this.getCollectionInfo({});
    const userIdEvent = await bluebird.fromCallback(cb =>
      this.database.findOne(
        { name: collectionInfo.name},
        this.applyQueryToDB({
          $and: [
            { "streamIds": { '$in': ['username'] } },
            { "content": { $eq: username } }]
        }),
        null, cb));

    if (userIdEvent && userIdEvent.userId) {
      return userIdEvent.userId;
    } else {
      return 0;
    }

  } catch (error) {
    throw error;
  }
};

/**
 * Create user
 * @param userParams - parameters to be saved
 * @return object with created user information in flat format
 */
Events.prototype.createUser = async function (userParams) {
  let user = {};
  try {
    let userInfoSerializer = await UserInfoSerializer.build();
    // get streams ids from the config that should be retrieved
    let userProfileStreamsIds = userInfoSerializer.getCoreStreams(UserInfoSerializer.getAllCoreStreams());

    // change password into hash
    if (userParams.password && !userParams.passwordHash) {
      userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
    }
    delete userParams.password;
   
    // create userId so that userId could be passed
    userParams = converters.createIdIfMissing(userParams);
    // form username event - it is separate because we set the _id 
    let updateObject = {
      streamIds: ["username", "indexed"],
      type: "string",
      content: userParams.username,
      id: userParams.id,
      created: timestamp.now(),
      modified: timestamp.now()
    };
    user.id = updateObject.id;

    // insert username event
    const username = await bluebird.fromCallback((cb) =>
      Events.super_.prototype.insertOne.call(this, user, updateObject, cb));
    user.username = username.content;
    
    // delete username so it won't be saved the second time
    delete userProfileStreamsIds['username'];

    // create all user account events
    Object.keys(userProfileStreamsIds).map(streamId => {
      if (userParams[streamId] || typeof userProfileStreamsIds[streamId].default !== "undefined") {
        let parameter = userProfileStreamsIds[streamId].default;

        // set default value if undefined
        if (typeof userParams[streamId] !== "undefined") {
          parameter = userParams[streamId];
        }

        // set parameter name and value for the result
        user[streamId] = parameter;

        // get additional stream ids from the config
        let streamIds = [streamId];
        if (userProfileStreamsIds[streamId].isIndexed === true) {
          streamIds.push("indexed");
        }

        // get type for the event from the config
        let eventType = "string";
        if (userProfileStreamsIds[streamId].type) {
          eventType = userProfileStreamsIds[streamId].type;
        }
        // create the event
        return bluebird.fromCallback((cb) =>
            Events.super_.prototype.insertOne.call(this, user, {
            streamIds: streamIds,
            type: eventType,
            content: parameter,
            created: timestamp.now(),
            modified: timestamp.now()
        }, cb));
      }
    });
   
    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Update user
 * @param {*} userParams
 */
Events.prototype.updateUser = async function ({ userId, userParams }) {
  try {
    let userInfoSerializer = await UserInfoSerializer.build();
    // get streams ids from the config that should be retrieved
    let userProfileStreamsIds = userInfoSerializer.getCoreStreams(UserInfoSerializer.getAllCoreStreams());

    // change password into hash if it exists
    if (userParams.password && !userParams.passwordHash) {
      userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
    }
    delete userParams.password;

    // update all core streams and do not allow additional properties
    Object.keys(userProfileStreamsIds).map(streamId => {
      if (userParams[streamId]) {
        return bluebird.fromCallback(cb => Events.super_.prototype.updateOne.call(this, 
          { id: userId },
          { streamIds: { $in: [streamId] } },
          { content: userParams[streamId] }, cb));
      }
    });
    return true;//TODO IEVA??
  } catch (error) {
    console.log(error,'error');
    throw error;
  }
};