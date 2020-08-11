/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const cuid = require('cuid');
const UserInfoSerializer = require('components/business/src/user/user_info_serializer');
const converters = require('../converters');
const timestamp = require('unix-timestamp');

/**
 * v1.5.0: Multiple streamIds per event
 *
 * - Changes Events.streamdId => Events.streamIds = [Events.streamdId]
 * // helpers: 
 * - find events with streamId property 
 * db.events.find({ "streamId": { $exists: true, $ne: null } }); 
 */
module.exports = async function (context, callback) {
  console.log('V1.5.22 => v1.6.0 Migration started');
  
  let accountsMigrated = 0;

  await migrateEvents();
  process.exit(0);
  await dropIndex();
  await createIndex();
  console.log('V1.5.22 => v1.6.0 Migrated ' + accountsMigrated + ' accounts.');
  callback();
  
  function getEventsCollection() {
    console.log('Fetching events collection');
    return bluebird.fromCallback(cb => context.database.getCollection({ name: 'events' }, cb));
  }

  function getStreamsCollection() {
    console.log('Fetching streams collection');
    return bluebird.fromCallback(cb => context.database.getCollection({ name: 'streams' }, cb));
  }

  function dropIndex() {
    console.log('Dropping previous indexes');
    return bluebird.fromCallback(cb => eventCollection.dropIndex('userId_1_streamId_1', cb));
  }

  function createIndex(done) {
    console.log('Building new indexes');
    return bluebird.fromCallback(cb => eventCollection.createIndex({ userId: 1, streamIds: 1 }, {background: true}, cb));
  }

  async function migrateEvents() {
    const eventsCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'events' }, cb));
    const usersCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'users' }, cb));

    let userInfoSerializer = await UserInfoSerializer.build();
    // get streams ids from the config that should be retrieved
    let userProfileStreamsIds = userInfoSerializer.getAllCoreStreams();

    const cursor = await usersCollection.find({});
    let requests = [];
    let user;
    while (await cursor.hasNext()) {
      user = await cursor.next();
      console.log('got', user);
      await migrateUser(user, userProfileStreamsIds);
      accountsMigrated++;
      requests.push({
        insertMany: [{
          _id: cuid(),
          type: 'salut',
        },
        ]
      });

      if (requests.length === 1000) {
        //Execute per 1000 operations and re-init
        await eventCollection.bulkWrite(requests);
        console.log('Migrated ' + accountsMigrated + ' accounts');
        requests = [];
      }
    }

    if (requests.length > 0) {
      await eventCollection.bulkWrite(requests);
      console.log('Migrated ' + accountsMigrated + ' accounts');
    }
  }

  async function migrateUser(params, userProfileStreamsIds) {
    let userParams = Object.assign({}, params);
    let user = {}; console.log('Create user', params);
    

    // create userId so that userId could be passed
    userParams = converters.createIdIfMissing(userParams);
    // form username event - it is separate because we set the _id 
    let insertObject = {
      streamIds: ['username', 'indexed'],
      type: userProfileStreamsIds.username.type,
      content: userParams.username,
      username__unique: userParams.username, // repeated field for uniqueness
      id: userParams.id,
      created: timestamp.now(),
      modified: timestamp.now(),
      createdBy: '',
      modifiedBy: '',
      time: timestamp.now()
    };
    user.id = insertObject.id;

    // create all user account events
    const eventsCreationActions = Object.keys(userProfileStreamsIds).map(streamId => {
      const streamData = userProfileStreamsIds[streamId];
      let content;

      // set content
      if (userParams[streamId] != null) {
        content = userParams[streamId];
      } else {
        content = streamData.default;
      }

      // create the event
      let creationObject = {
        streamIds: [streamId],
        type: streamData.type,
        content: content,
        created: timestamp.now(),
        modified: timestamp.now(),
        time: timestamp.now(),
        createdBy: '',
        modifiedBy: '',
      }

      if (isPropertyUnique(streamId)) {
        streamIds.push('indexed');
        creationObject[streamId + '__unique'] = content; // repeated field for uniqueness
      }
      creationObject.streamIds = streamIds;

      return bluebird.fromCallback((cb) =>
        Events.super_.prototype.insertOne.call(this, user, creationObject, cb));

      function isPropertyUnique(streamId) { return streamData.isUnique === true; }
    });
    await Promise.all(eventsCretionActions);
    return user;
  }



  async function migrateStreams() {
    const res = await streamCollection.updateMany({ singleActivity: true }, { $unset: { singleActivity: '' }});
    console.log('Migrated', res.modifiedCount, 'streams');
  }

};
