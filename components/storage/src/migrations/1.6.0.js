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
 * v1.6.0: Account in events
 *
 * - create events from users collection documents matching the system streams definition
 * - create indexes for unique fields
 * - TODO delete users collection
 */
module.exports = async function (context, callback) {
  console.log('V1.5.22 => v1.6.0 Migration started');
  
  let userInfoSerializer = await UserInfoSerializer.build();
  // get streams ids from the config that should be retrieved
  const userAccountStreams = userInfoSerializer.getAllCoreStreams();
  const userAccountStreamIds = Object.keys(userAccountStreams);

  const eventsCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'events' }, cb));

  let accountsMigrated = 0;

  await migrateAccounts(userAccountStreams, userAccountStreamIds, eventsCollection);
  await createIndex(userAccountStreams, userAccountStreamIds, eventsCollection);
  console.log('V1.5.22 => v1.6.0 Migration finished');
  callback();

  async function migrateAccounts(userAccountStreams, userAccountStreamIds, eventsCollection) {
    
    const usersCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'users' }, cb));

    const cursor = await usersCollection.find({});
    let requests = [];
    while (await cursor.hasNext()) {
      const user = await cursor.next();
      const eventsCreations = migrateAccount(user, userAccountStreams, userAccountStreamIds);
      accountsMigrated++;
      requests = requests.concat(eventsCreations);
      if (requests.length >= 1000) {
        //Execute per 1000 operations and re-init
        const res = await eventsCollection.insertMany(requests);
        requests = [];
      }
    }

    if (requests.length > 0) {
      const res = await eventsCollection.insertMany(requests);
    }
  }

  function migrateAccount(userParams, userAccountStreams, userAccountStreamIds) {

    // flatten storageUsed
    if (userParams.storageUsed != null) {
      userParams.dbDocuments = userParams.storageUsed.dbDocuments;
      userParams.attachedFiles = userParams.storageUsed.attachedFiles;
    }  

    // create all user account events
    const eventsCreations = [];
    userAccountStreamIds.map(streamId => {
      const streamData = userAccountStreams[streamId];
      let content;

      // set content
      if (userParams[streamId] != null) {
        content = userParams[streamId];
      } else {
        content = streamData.default;
      }

      // create the event
      const creationObject = {
        id: cuid(),
        streamIds: [streamId],
        type: streamData.type,
        content: content,
        created: timestamp.now(),
        modified: timestamp.now(),
        time: timestamp.now(),
        createdBy: 'system',
        modifiedBy: 'system',
        userId: userParams._id,
      }

      if (isPropertyUnique(streamId)) {
        creationObject[buildUniqueMongoField(streamId)] = content; // repeated field for uniqueness
      }

      eventsCreations.push(creationObject);

      function isPropertyUnique(streamId) { return streamData.isUnique === true; }
    });
    return eventsCreations;
  }

  function buildUniqueMongoField(streamId) {
    return streamId + '_unique';
  }

  async function createIndex(userAccountStreams, userAccountStreamIds, eventsCollection) {
    console.log('Building new indexes');
    for (let i=0; i<userAccountStreamIds.length; i++) {
      const streamId = userAccountStreamIds[i];
      const streamData = userAccountStreams[streamId];
      if (streamData.isUnique) {
        await bluebird.fromCallback(cb => eventsCollection.createIndex({ [streamId + '_unique']: 1 }, {background: true}, cb));      
      }
    }
  }

};
