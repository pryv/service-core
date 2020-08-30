/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
// const cuid = require('cuid');
// const timestamp = require('unix-timestamp');

const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const UserRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

/**
 * v1.6.0: Account in events
 *
 * - create events from users collection documents matching the system streams definition
 * - create indexes for unique fields
 * - TODO delete users collection
 */
module.exports = async function (context, callback) {
  console.log('V1.5.22 => v1.6.0 Migration started');

  const UserEventsStorage = new (require('../user/Events'))(context.database);
  // get streams ids from the config that should be retrieved
  const userAccountStreams = SystemStreamsSerializer.getAllAccountStreams();
  const userAccountStreamIds = Object.keys(userAccountStreams);

  const eventsCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'events' }, cb));

  //let accountsMigrated = 0;

  await migrateAccounts(userAccountStreams, userAccountStreamIds, UserEventsStorage);
  await createIndex(userAccountStreams, userAccountStreamIds, UserEventsStorage);
  //await createDBAddIndexes(UserEventsStorage);
  console.log('V1.5.22 => v1.6.0 Migration finished');
  callback();

  async function migrateAccounts (userAccountStreams, userAccountStreamIds, UserEventsStorage) {
    
    const usersCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'users' }, cb));

    const cursor = await usersCollection.find({});
    let userRepository = new UserRepository(UserEventsStorage);

    //let requests = [];
    let shouldContinue: boolean;
    let insertedUser;
    let user;
    while (await cursor.hasNext()) {
      user = await cursor.next();
      try {
        if (!user.id && user._id) {
          user.id = user._id;
        }
        const userObj: User = new User(user);
        insertedUser = await userRepository.insertOne(userObj);
      } catch (err) {
        shouldContinue = isExpectedUniquenessError(err);
        if (shouldContinue == false) {
          throw new Error(err);
        }
      }
      /*
      const eventsCreations = migrateAccount(user, userAccountStreams, userAccountStreamIds);
      accountsMigrated++;
      requests = requests.concat(eventsCreations);
      if (requests.length >= 1000) {
        //Execute per 1000 operations and re-init
        const res = await eventsCollection.insertMany(requests);
        requests = [];
      }*/
    }

    // if (requests.length > 0) {
    //   const res = await eventsCollection.insertMany(requests);
    // }
  }
  function isExpectedUniquenessError (err): boolean {
    if (typeof err.isDuplicateIndex === 'function') {
      let fieldName = err.duplicateIndex();
      if (['username', 'email'].includes(fieldName)) {
        // one of the expected fields, so the migration could be continued
        return true;
      }
    }
    return false;
  }

/*
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

      if (isPropertyUnique(streamData)) {
        creationObject[buildUniqueMongoField(streamId)] = content; // repeated field for uniqueness
      }

      eventsCreations.push(creationObject);

      function isPropertyUnique(streamData) { return streamData.isUnique === true; }
    });
    return eventsCreations;
  }

  function buildUniqueMongoField(streamId) {
    return streamId + '_unique';
  }
*/
  async function createIndex (userAccountStreams, userAccountStreamIds, UserEventsStorage) {
    console.log('Building new indexes');
    
    for (let i=0; i<userAccountStreamIds.length; i++) {
      const streamId = userAccountStreamIds[i];
      const streamData = userAccountStreams[streamId];
      if (streamData.isUnique) {
        await bluebird.fromCallback(cb => UserEventsStorage.database.db.collection('events')
          .createIndex({ [streamId + '__unique']: 1 },
            {
              unique: true,
              partialFilterExpression: {
                [streamId + '__unique']: { '$exists': true },
                streamIds: 'unique'
              },
              background: true
            }, cb));
      }
    }
  }

};
