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
 */
module.exports = async function (context, callback) {
  console.log('V1.6.21 => v1.7.0 Migration started');

  const UserEventsStorage = new (require('../user/Events'))(context.database);
  // get streams ids from the config that should be retrieved
  const uniqueProperties: Array<string> = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
  const uniquePropertiesToDelete: Array<string> = uniqueProperties.map(s => s + '__unique');
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
      await migrateUserEvents(usernameEvent, eventsCollection, oldToNewStreamIdsMap);
    }
  }

  async function migrateUserEvents(usernameEvent: {}, eventsCollection: {}, oldToNewStreamIdsMap: Map<string, string>, newSystemStreamIds: Array<string>): Promise<void> {
    const eventsCursor: {} = eventsCollection.find({ userId: usernameEvent.userId });
    const BUFFER_SIZE: number = 500;
    let requests: Array<{}> = [];
    while (await eventsCursor.hasNext()) {
      let event: Event = await eventsCursor.next();

      if (! isSystemEvent(event)) continue;

      //console.log('got event', event);

      const streamIds: Array<string> = translateStreamIdsIfNeeded(event.streamIds, oldToNewStreamIdsMap);

      const request = {
        updateOne: {
          filter: { '_id': event._id },
          update: {
            $set: { streamIds },
          }
        }
      }
      if (isUniqueEvent(event.streamIds)) request.updateOne.update['$unset'] = buildUniquePropsToDelete(event);

      //console.log('translated to', JSON.stringify(request,null,2));
      requests.push(request);
      if (requests.length > BUFFER_SIZE) requests = await flushToDb(requests, eventsCollection);
    }
    if (requests.length > 1) await flushToDb(requests, eventsCollection);

    function isUniqueEvent(streamIds: Array<string>): boolean {
      if (streamIds.indexOf('.unique') > -1) return true;
      return false;
    }

    function buildUniquePropsToDelete(event) {
      const unsets = {};
      for (const prop of uniquePropertiesToDelete) {
        if (event[prop] != null) unsets[prop] = 1;
      }
      return unsets;
    }

    function isSystemEvent(event: Event): boolean {
      if (event.streamIds == null) return false; // if event is deleted
      for (const streamId of event.streamIds) {
        if (streamId.startsWith('.')) return true; // can't use new check because it doesn't work with DOT anymore
      }
      return false;
    }

    async function flushToDb(events: Array<{}>, eventsCollection: {}): Promise<void> {
      const result: {} = await eventsCollection.bulkWrite(events);
      console.info(`flushed ${result.nModified} modifications into database`);
      return [];
    }

    function translateStreamIdsIfNeeded(streamIds: Array<string>, oldToNewMap: Map<string, string>): Array<string> {
      const translatedStreamIds: Array<string> = [];
      for (const streamId of streamIds) {
        translatedStreamIds.push(translateToNewOrNothing(streamId, oldToNewMap));
      }
      return translatedStreamIds;
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
