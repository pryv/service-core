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
  DefaultStreamsSerializer = require('components/business/src/user/user_info_serializer'),
  encryption = require('components/utils').encryption;

const { getConfig, Config } = require('components/api-server/config/Config');
const config: Config = getConfig();

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
  this.systemStreamsSettings = config.get('systemStreams:account');

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

function getDbIndexes (systemStreamsSettings) {
  // TODO: review indexes against 1) real usage and 2) how Mongo actually uses them
  let indexes = [
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

  // for each event group that has to be unique add a rule
  if (systemStreamsSettings) {
    Object.keys(systemStreamsSettings).forEach(streamId => {
      if (systemStreamsSettings[streamId].isUnique === true) {
        indexes.push({
          index: { [streamId + '__unique']: 1 },
          options: {
            unique: true,
            partialFilterExpression: {
              [streamId + '__unique']: { $exists: true },
              streamIds: 'unique'
            }
          }
        });
      }
    });
  }
  return indexes;
}
/**
 * Implementation.
 */
Events.prototype.getCollectionInfo = function (user) {
  return {
    name: 'events',
    indexes: getDbIndexes(this.systemStreamsSettings),
    useUserId: user.id
  };
};

Events.prototype.getCollectionInfoWithoutUserId = function () {
  return {
    name: 'events',
    indexes: getDbIndexes(this.systemStreamsSettings)
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
    let defaultStreamsSerializer = new DefaultStreamsSerializer();
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds;
    if (getAll) {
      userAccountStreamsIds = defaultStreamsSerializer.getAllAccountStreams();
    } else {
      userAccountStreamsIds = defaultStreamsSerializer.getReadableAccountStreams();
    }
    // form the query
    let query = {
      '$and': [
        { 'streamIds': { '$in': Object.keys(userAccountStreamsIds) } },
        { 'streamIds': { '$eq': DefaultStreamsSerializer.options.STREAM_ID_ACTIVE } }
      ]
    };

    const dbItems = await bluebird.fromCallback(cb => this.database.find(
      this.getCollectionInfo(user),
      this.applyQueryToDB(query),
      this.applyOptionsToDB({}),
      cb));

    const userProfileEvents = this.applyItemsFromDB(dbItems);
    // convert events to the account info structure
    return defaultStreamsSerializer.serializeEventsToAccountInfo(userProfileEvents);
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
    const userIdEvent = await bluebird.fromCallback(cb =>
      this.database.findOne(
        this.getCollectionInfoWithoutUserId(),
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
 * Override base method to set deleted:null
 * 
 * @param {*} user 
 * @param {*} item 
 * @param {*} callback 
 */
Events.prototype.insertOne = function (user, item, callback, options) {
  this.database.insertOne(
    this.getCollectionInfo(user),
    this.applyItemToDB(this.applyItemDefaults(item)),
    function (err) {
      if (err) {
        return callback(err);
      }
      callback(null, item);
    },
    options
  );
};
  
/**
 * Create user
 * @param userParams - parameters to be saved
 * @return object with created user information in flat format
 */
Events.prototype.createUser = async function (params) {
  let userParams = Object.assign({}, params);
  let user = {};

  // first explicitly create a collection, because it would fail in the transation
  //await bluebird.fromCallback(cb => this.database.client.createCollection('events', {}, cb));
  const collectionInfo = this.getCollectionInfoWithoutUserId();
  await this.database.createCollection(collectionInfo.name);
  
  // Start a transaction session
  const session = await this.database.startSession();

  // TODO IEVA - check if I can improve options
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' }
  };

  try {
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds = (new DefaultStreamsSerializer()).getAllAccountStreams();
    //TODO IEVA console.log(userAccountStreamsIds['insurancenumber'],'userAccountStreamsIdsssssssssssssssss');
    // change password into hash (also allow for tests to pass passwordHash directly)
    if (userParams.password && !userParams.passwordHash) {
      userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
    }
    delete userParams.password;

    // create userId so that userId could be passed
    userParams = converters.createIdIfMissing(userParams);
    // form username event - it is separate because we set the _id 
    let updateObject = {
      streamIds: ['username', 'unique', DefaultStreamsSerializer.options.STREAM_ID_ACTIVE],
      type: userAccountStreamsIds.username.type,
      content: userParams.username,
      username__unique: userParams.username, // repeated field for uniqueness
      id: userParams.id,
      created: timestamp.now(),
      modified: timestamp.now(),
      createdBy: '',
      modifiedBy: '',
      time: timestamp.now()
    };
    user.id = updateObject.id;
    await session.withTransaction(async () => {
      // insert username event
      const username = await bluebird.fromCallback((cb) =>
        this.insertOne(user, updateObject, cb, {session}));
      user.username = username.content;

      // delete username so it won't be saved the second time
      delete userAccountStreamsIds['username'];

      // create all user account events
      const eventsCreationActions = Object.keys(userAccountStreamsIds).map(streamId => {
        if (userParams[streamId] || typeof userAccountStreamsIds[streamId].default !== 'undefined') {
          let parameter = userAccountStreamsIds[streamId].default;

          // set default value if undefined
          if (typeof userParams[streamId] !== 'undefined') {
            parameter = userParams[streamId];
          }

          // set parameter name and value for the result
          user[streamId] = parameter;

          // get type for the event from the config
          let eventType = 'string';
          if (userAccountStreamsIds[streamId].type) {
            eventType = userAccountStreamsIds[streamId].type;
          }

          // create the event
          let creationObject = {
            type: eventType,
            content: parameter,
            created: timestamp.now(),
            modified: timestamp.now(),
            time: timestamp.now(),
            createdBy: user.id,
            modifiedBy: user.id
          }

          // get additional stream ids from the config
          let streamIds = [streamId, DefaultStreamsSerializer.options.STREAM_ID_ACTIVE];
          if (userAccountStreamsIds[streamId].isUnique === true) {
            streamIds.push("unique");
            creationObject[streamId + '__unique'] = parameter; // repeated field for uniqness
          }
          creationObject.streamIds = streamIds;
          return bluebird.fromCallback((cb) =>
            this.insertOne(user, creationObject, cb, { session }));
        }
      });
      await Promise.all(eventsCreationActions);
    }, transactionOptions);
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
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds = (new DefaultStreamsSerializer()).getAllAccountStreams();

    // change password into hash if it exists
    if (userParams.password && !userParams.passwordHash) {
      userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
    }
    delete userParams.password;

    // update all account streams and do not allow additional properties
    Object.keys(userAccountStreamsIds).map(streamId => {
      if (userParams[streamId]) {
        return bluebird.fromCallback(cb => Events.super_.prototype.updateOne.call(this,
          { id: userId, streamIds: DefaultStreamsSerializer.options.STREAM_ID_ACTIVE },
          { streamIds: { $in: [streamId] } },
          { content: userParams[streamId] }, cb));
      }
    });
    return true;//TODO IEVA??
  } catch (error) {
    throw error;
  }
};


Events.prototype.findAllUsernames = async function () {
  let users = [];
  // get list of user ids and usernames
  let query = {
    streamIds: { $in: ['username'] },
    deleted: null,
    headId: null
  }
  const usersNames = await bluebird.fromCallback(cb =>
    this.database.find(
      this.getCollectionInfoWithoutUserId(),
      this.applyQueryToDB(query),
      this.applyOptionsToDB(null), cb)
  );
  const usersCount = usersNames.length;
  let user;
  let defaultStreamsSerializer = new DefaultStreamsSerializer();
  for (var i = 0; i < usersCount; i++) {
    user = defaultStreamsSerializer.serializeEventsToAccountInfo([usersNames[i]]);
    user.id = usersNames[i].userId;
    users.push(user);
  }
  return users;
}
/**
 * Get All users
 * (Used ONLY for testing to make each user structure compatible with a 
 * previous account structure and it is implemented in inefficiant way)
 */
Events.prototype.findAllUsers = async function () {
  try {
    let users = [];
    // get list of user ids and usernames
    let query = {
      streamIds: { $in: ['username'] },
      deleted: null,
      headId: null
    }
    const usersNames = await bluebird.fromCallback(cb =>
      this.database.find(
        this.getCollectionInfoWithoutUserId(),
        this.applyQueryToDB(query),
        this.applyOptionsToDB(null), cb)
    );

    const usersCount = usersNames.length;
    let user;
    for (var i = 0; i < usersCount; i++) {
      user = await this.getUserInfo({ user: { id: usersNames[i].userId }, getAll: true });
      user.id = usersNames[i].userId;

      // for the crazy unknown reason in the tests invitation token, appId and referer
      // values are not validated, so lets remove them until find out how often this is the
      // case
      delete user.referer;
      delete user.appId;
      delete user.invitationToken;
      users.push(user);
    }
    return users;
  } catch (error) {
    throw error;
  }
};

/**
 * Get user password hash
 */
Events.prototype.getUserPasswordHash = async function (userId) {
  let userPass;
  userPass = await bluebird.fromCallback(cb =>
    this.database.findOne(
      this.getCollectionInfo({ id: userId }),
      this.applyQueryToDB({
        $and: [
          { streamIds: 'passwordHash' }
        ]
      }),
      this.applyOptionsToDB(null), cb));
  return (userPass?.content) ? userPass.content : null;
};