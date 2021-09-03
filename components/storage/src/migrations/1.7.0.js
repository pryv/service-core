/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { UsersRepository, getUsersRepository, User } = require('business/src/users');

const { getLogger } = require('@pryv/boiler');
const ROOT_STREAM_TAG = 'tags-migrated';
const STREAM_PREFIX = 'migrated-tag-';
const DOT: string = '.';
/**
 * v1.7.0: 
 * - refactor streamId prefixes from '.' to ':_system:' and ':system'
 * - remove XX__unique properties from all events containing '.unique'
 * 
 * - remove tags and set them as "root streams" with the prefix "tag-"
 */
module.exports = async function (context, callback) {

  const logger = getLogger('migration-1.7.0');
  logger.info('V1.6.21 => v1.7.0 Migration started');

  const uniqueProperties: Array<string> = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
  const uniquePropertiesToDelete: Array<string> = uniqueProperties.map(s => s + '__unique');
  const newSystemStreamIds: Array<string> = SystemStreamsSerializer.getAllSystemStreamsIds();
  const oldToNewStreamIdsMap: Map<string, string> = buildOldToNewStreamIdsMap(newSystemStreamIds);
  const eventsCollection = await bluebird.fromCallback(cb =>
    context.database.getCollection({ name: 'events' }, cb));
  const streamsCollection = await bluebird.fromCallback(cb =>
    context.database.getCollection({ name: 'streams' }, cb));
  const userEventsStorage = new (require('../user/Events'))(context.database);
  
  await migrateAccounts(eventsCollection);
  logger.info('Accounts were migrated, now rebuilding the indexes');
  await migrateTags(eventsCollection, streamsCollection);

  await rebuildIndexes(context.database, eventsCollection, userEventsStorage.getCollectionInfoWithoutUserId()),
  logger.info('V1.6.21 => v1.7.0 Migration finished');
  callback();

  async function migrateTags (eventsCollection, streamsCollection) {
    // for all tags create "tag-<tag>" stream with the parent "tags" and name "<tag>"
    // remove events.tag and add it to streamIds
  }

  async function migrateAccounts (eventsCollection): Promise<void> {
    const usernameCursor = await eventsCollection.find({ 
      streamIds: { $in: ['.username'] },
      deleted: null,
      headId: null,
    });

    let usersCounter: number = 0;
    while (await usernameCursor.hasNext()) {
      const usernameEvent = await usernameCursor.next();
      if (usersCounter % 200 === 0) {
        logger.info(`Migrating ${usersCounter + 1}st user`);
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

    async function flushToDb(events: Array<{}>, eventsCollection: {}): Promise<Array<{}>> {
      const result: {} = await eventsCollection.bulkWrite(events);
      logger.info(`flushed ${result.nModified} modifications into database`);
      return [];
    }

    function translateStreamIdsIfNeeded(streamIds: Array<string>, oldToNewMap: Map<string, string>): Array<string> {
      const translatedStreamIds: Array<string> = [];
      for (const streamId of streamIds) {
        translatedStreamIds.push(translateToNewOrNothing(streamId, oldToNewMap));
      }
      return translatedStreamIds;

      function translateToNewOrNothing(oldStreamId: string, oldToNewMap: Map<string, string>): string {
        return oldToNewMap[oldStreamId] ? oldToNewMap[oldStreamId] : oldStreamId;
      }
    }
  }

  function buildOldToNewStreamIdsMap(newSystemStreamIds: Array<string>): Map<string, string> {
    const oldToNewMap: {} = {};
    for (const newStreamId of newSystemStreamIds) {
      const oldStreamId: string = translateToOldPrefix(newStreamId);
      oldToNewMap[oldStreamId] = newStreamId;
    }
    return oldToNewMap;

    function translateToOldPrefix(streamId: string): string {
      return DOT + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    }
  }

  async function rebuildIndexes(database, eventsCollection, collectionInfo): Promise<void> {
    const indexCursor = await eventsCollection.listIndexes();
    while (await indexCursor.hasNext()) {
      const index = await indexCursor.next();
      if (index.name.endsWith('__unique_1')) {
        logger.info('dropping index', index.name);
        await eventsCollection.dropIndex(index.name);
      }
    }
  }

  //----------------- TAGS 

  
  async function migrateTags(eventsCollection, streamsCollection): Promise<void> { 
    
    const storageLayer = await require('storage').getStorageLayer();
    // get all users with tags 
    const usersWithTag = await eventsCollection.distinct('userId', {tags: { $exists: true, $ne: null }});
    for (userId of usersWithTag) {
      const now = Date.now() / 1000; 

      async function createStream(id, name, parentId) {
        try { 
          await bluebird.fromCallback(cb => storageLayer.streams.insertOne({id: userId}, {name: name, id: id, parentId: parentId, modifiedBy: 'migration', createdBy: 'migration', created: now, modified: now}, cb));
        } catch (e) {
          if (e.code !== 11000) throw(e)// already exists.. oK
        }
      }

      // create root stream
      await createStream(ROOT_STREAM_TAG, 'Migrated Tags')
      // get all tags for user
      const tags = await eventsCollection.distinct('tags', {userId: userId});
      for (tag of tags) { 
        await createStream(STREAM_PREFIX + tag, tag, ROOT_STREAM_TAG);
        await migrateEvents(userId);
      }
      // migrate tags (add to streams for each event)
    }
  
    async function migrateEvents(userId) {
      eventsMigrated = 0;
      const cursor = await eventsCollection.find({ userId: userId, tags: { $exists: true, $ne: [] } });
      let requests = [];
      let document;
      while (await cursor.hasNext()) {
        document = await cursor.next();
        if (! document.tags) continue;
        const newStreams = document.tags.filter(t => t != null).map(t => STREAM_PREFIX + t);

        eventsMigrated++;
        requests.push({
          'updateOne': {
            'filter': { '_id': document._id },
            'update': {
              '$addToSet': { 'streamIds': { $each: newStreams }},
              '$unset': { 'tags': ''}
            }
          }
        });

        if (requests.length === 1000) {
          //Execute per 1000 operations and re-init
          await eventsCollection.bulkWrite(requests);
          console.log('Migrated ' + eventsMigrated + ' events for user ' + userId);
          requests = [];
        }
      }

      if (requests.length > 0) {
        await eventsCollection.bulkWrite(requests);
        console.log('Migrated ' + eventsMigrated + ' events for user ' + userId);
      }
    }
  }

};
