/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository, User } = require('business/src/users');

/**
 * v1.6.0: Account in events
 *
 * - create events from users collection documents matching the system streams definition
 * - create indexes for unique fields
 * - TODO delete users collection
 */
module.exports = async function (context, callback) {
  console.log('V1.5.22 => v1.6.0 Migration started');

  // get streams ids from the config that should be retrieved
  await SystemStreamsSerializer.init();
  const userEventsCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'users' }, cb));
  const userAccountStreams = SystemStreamsSerializer.getAccountMap();
  const userAccountStreamIds = Object.keys(userAccountStreams);
  let usersRepository = await getUsersRepository(); 

  console.log('Accounts were migrated, now creating the indexes');
  await createIndex(userAccountStreams, userAccountStreamIds, userEventsCollection);
  console.log('V1.5.22 => v1.6.0 Migration finished');
  callback();

  async function migrateAccounts () {
   
    const cursor = await userEventsCollection.find({});

    //let requests = [];
    let shouldContinue: boolean;
    let insertedUser;
    let user;
    let i = 0;
    while (await cursor.hasNext()) {
      user = await cursor.next();
      if (i % 200 === 0) {
        console.log(`Migrating ${i} user`);
      }
      i += 1;
      try {
        user.id = user._id;
        const userObj: User = new User(user);
        insertedUser = await usersRepository.insertOne(userObj);
      } catch (err) {
        shouldContinue = isExpectedUniquenessError(err);
        if (shouldContinue == false) {
          console.log(err,'err');
          throw new Error(err);
        }
      }
    }
  }
  function isExpectedUniquenessError (err): boolean {
    if (err.isDuplicate) {
      let fieldName = err.getDuplicateSystemStreamId();
      if (['username', 'email'].includes(fieldName)) {
        // one of the expected fields, so the migration could be continued
        return true;
      }
    }
    return false;
  }

  async function createIndex (userAccountStreams, userAccountStreamIds, eventsCollection) {
    console.log('Building new indexes');
    
    for (let i=0; i<userAccountStreamIds.length; i++) {
      const streamId = userAccountStreamIds[i];
      const streamData = userAccountStreams[streamId];
      const streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamId);
      if (streamData.isUnique) {
        await bluebird.fromCallback(cb => eventsCollection.createIndex({ [streamIdWithoutDot + '__unique']: 1 },
            {
              unique: true,
              partialFilterExpression: {
                [streamIdWithoutDot + '__unique']: { '$exists': true },
                streamIds: SystemStreamsSerializer.options.STREAM_ID_UNIQUE
              },
              background: true
            }, cb));
      }
    }
  }

};
