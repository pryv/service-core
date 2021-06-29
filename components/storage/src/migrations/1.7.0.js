/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { UsersRepository, getUsersRepository } = require('business/src/users/repository');
const User = require('business/src/users/User');

const DOT: string = '.';
/**
 * v1.7.0: 
 * - refactor streamId prefixes from '.' to ':_system:' and ':system'
 * - remove XX__unique properties from all events containing '.unique'
 * - remove tags, replacing them with streamIds? -> yes, with a property "previously tag" for backward compatibility in API
 * - 
 */
module.exports = async function (context, callback) {
  console.log('V1.6.21 => v1.7.0 Migration started');

  const UserEventsStorage = new (require('../user/Events'))(context.database);
  // get streams ids from the config that should be retrieved
  const uniqueProperties: Array<string> = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
  const newSystemStreamIds: Array<string> = SystemStreamsSerializer.getAllSystemStreamsIds();
  const oldToNewStreamIdsMap: Map<string, string> = buildOldToNewStreamIdsMap(newSystemStreamIds);
  const usersRepository: UsersRepository = getUsersRepository();

  await migrateAccounts(UserEventsStorage);
  console.log('Accounts were migrated, now creating the indexes');
  //await createIndex(userAccountStreams, userAccountStreamIds, UserEventsStorage);
  console.log('V1.6.21 => v1.7.0 Migration finished');
  callback();

  async function migrateAccounts () {
    const eventsCollection = await bluebird.fromCallback(cb =>
      context.database.getCollection({ name: 'events' }, cb));
    const usernameCursor = await eventsCollection.find({ 
      streamIds: { $in: ['.username'] },
      deleted: null,
      headId: null,
    });

    let usersCounter: number = 0;
    let eventsCounter: number = 0;
    while (await usernameCursor.hasNext()) {
      const usernameEvent = await usernameCursor.next();
      if (usersCounter % 200 === 0) {
        console.log(`Migrating ${usersCounter + 1}st user`);
      }
      usersCounter++;
      console.log('got', usernameEvent)
      await migrateUserEvents(usernameEvent, eventsCollection, oldToNewStreamIdsMap);
    }
  }

  async function migrateUserEvents(usernameEvent: {}, eventsCollection: {}, oldToNewStreamIdsMap: Map<string, string>, newSystemStreamIds: Array<string>): Promise<void> {
    const eventsCursor = eventsCollection.find({ userId: usernameEvent.userId });
    while (await eventsCursor.hasNext()) {
      const event = await eventsCursor.next();
      //console.log('got event', event);
      if (event?.streamIds?.indexOf('.email') > 0) console.log('got event', event);
      const streamIds: Array<string> = translateStreamIdsIfNeeded(event.streamIds, oldToNewStreamIdsMap);
      event.streamIds = streamIds;
      for (const uniqueProp of uniqueProperties) {
        delete event[buildProperty(uniqueProp)];
      }
      if (event?.streamIds?.indexOf(':system:email') > 0) console.log('translated to', event);
    }

    function translateStreamIdsIfNeeded(streamIds: Array<string>, oldToNewMap: Map<string, string>): Array<string> {
      if (streamIds == null) return null;
      const translatedStreamIds: Array<string> = [];
      for (const streamId of streamIds) {
        translatedStreamIds.push(translateToNewOrNothing(streamId, oldToNewMap));
      }
      return translatedStreamIds;
    }

    function buildProperty(prop: string): string {
      return prop + '__unique'; 
    }
  }

  function buildOldToNewStreamIdsMap(newSystemStreamIds: Array<string>): Map<string, string> {
    //const oldSystemStreamIds: Array<string> = [];
    const oldToNewMap: {} = {};
    for (const newStreamId of newSystemStreamIds) {
      const oldStreamId: string = translateToOldPrefix(newStreamId);
      //oldSystemStreamIds.push(oldStreamId);
      oldToNewMap[oldStreamId] = newStreamId;
    }
    return oldToNewMap;

    function translateToOldPrefix(streamId: string): string {
      return DOT + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    }
  }

  function translateToNewOrNothing(oldStreamId: string, oldToNewMap: Map<string, string>): string {
    return oldToNewMap[oldStreamId] ? oldToNewMap[oldStreamId] : oldStreamId;
  }

  async function createIndex (userAccountStreams, userAccountStreamIds, UserEventsStorage) {
    console.log('Building new indexes');
    
    for (let i=0; i<userAccountStreamIds.length; i++) {
      const streamId = userAccountStreamIds[i];
      const streamData = userAccountStreams[streamId];
      const streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamId);
      if (streamData.isUnique) {
        await bluebird.fromCallback(cb => UserEventsStorage.database.db.collection('events')
          .createIndex({ [streamIdWithoutDot + '__unique']: 1 },
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
