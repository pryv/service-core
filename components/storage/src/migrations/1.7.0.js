/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { UsersRepository, getUsersRepository, User } = require('business/src/users');
const { getMall } = require('mall');
const { getLogger } = require('@pryv/boiler');
const { TAG_ROOT_STREAMID, TAG_PREFIX } = require('api-server/src/methods/helpers/backwardCompatibility');
const DOT = '.';
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
  await SystemStreamsSerializer.init();
  const newSystemStreamIds = SystemStreamsSerializer.getAllSystemStreamsIds();
  const oldToNewStreamIdsMap = buildOldToNewStreamIdsMap(newSystemStreamIds);
  const eventsCollection = await context.database.getCollection({
    name: 'events'
  });
  const streamsCollection = await context.database.getCollection({
    name: 'streams'
  });
  const accessesCollection = await context.database.getCollection({
    name: 'accesses'
  });
  await migrateAccounts(eventsCollection);
  await migrateTags(eventsCollection, streamsCollection);
  await migrateTagsAccesses(accessesCollection);
  logger.info('Accounts were migrated, now rebuilding the indexes');
  await rebuildIndexes(context.database, eventsCollection),
  logger.info('V1.6.21 => v1.7.0 Migration finished');
  callback();
  async function migrateAccounts (eventsCollection) {
    const usernameCursor = eventsCollection.find({
      streamIds: { $in: ['.username'] },
      deleted: null,
      headId: null
    });
    let usersCounter = 0;
    while (await usernameCursor.hasNext()) {
      const usernameEvent = await usernameCursor.next();
      if (usersCounter % 200 === 0) {
        logger.info(`Migrating ${usersCounter + 1}st user`);
      }
      usersCounter++;
      await migrateUserEvents(usernameEvent, eventsCollection, oldToNewStreamIdsMap);
    }
  }
  async function migrateUserEvents (usernameEvent, eventsCollection, oldToNewStreamIdsMap, newSystemStreamIds) {
    const eventsCursor = eventsCollection.find({
      userId: usernameEvent.userId
    });
    const BUFFER_SIZE = 500;
    let requests = [];
    while (await eventsCursor.hasNext()) {
      const event = await eventsCursor.next();
      if (!isSystemEvent(event)) { continue; }
      const streamIds = translateStreamIdsIfNeeded(event.streamIds, oldToNewStreamIdsMap);
      const request = {
        updateOne: {
          filter: { _id: event._id },
          update: {
            $set: { streamIds }
          }
        }
      };
      if (isUniqueEvent(event.streamIds)) { request.updateOne.update.$unset = buildUniquePropsToDelete(event); }
      // console.log('translated to', JSON.stringify(request,null,2));
      requests.push(request);
      if (requests.length > BUFFER_SIZE) { requests = await flushToDb(requests, eventsCollection); }
    }
    if (requests.length > 1) { await flushToDb(requests, eventsCollection); }
    function isUniqueEvent (streamIds) {
      if (streamIds.indexOf('.unique') > -1) { return true; }
      return false;
    }
    function buildUniquePropsToDelete (event) {
      const UNIQUE_SUFFIX = '__unique';
      const unsets = {};
      for (const prop of Object.keys(event)) {
        if (prop.indexOf(UNIQUE_SUFFIX) > -1) { unsets[prop] = 1; }
      }
      return unsets;
    }
    function isSystemEvent (event) {
      if (event.streamIds == null) { return false; } // if event is deleted
      for (const streamId of event.streamIds) {
        if (streamId.startsWith('.')) { return true; } // can't use new check because it doesn't work with DOT anymore
      }
      return false;
    }
    async function flushToDb (events, eventsCollection) {
      const result = await eventsCollection.bulkWrite(events);
      logger.info(`flushed ${result.nModified} modifications into database`);
      return [];
    }
    function translateStreamIdsIfNeeded (streamIds, oldToNewMap) {
      const translatedStreamIds = [];
      for (const streamId of streamIds) {
        translatedStreamIds.push(translateToNewOrNothing(streamId, oldToNewMap));
      }
      return translatedStreamIds;
      function translateToNewOrNothing (oldStreamId, oldToNewMap) {
        return oldToNewMap[oldStreamId]
          ? oldToNewMap[oldStreamId]
          : oldStreamId;
      }
    }
  }
  function buildOldToNewStreamIdsMap (newSystemStreamIds) {
    const oldToNewMap = {};
    for (const newStreamId of newSystemStreamIds) {
      const oldStreamId = translateToOldPrefix(newStreamId);
      oldToNewMap[oldStreamId] = newStreamId;
    }
    return oldToNewMap;
    function translateToOldPrefix (streamId) {
      return DOT + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    }
  }
  async function rebuildIndexes (database, eventsCollection) {
    for (const item of eventsIndexes) {
      item.options.background = true;
      await eventsCollection.createIndex(item.index, item.options);
    }
    const indexCursor = await eventsCollection.listIndexes();
    while (await indexCursor.hasNext()) {
      const index = await indexCursor.next();
      if (index.name.endsWith('__unique_1')) {
        logger.info('dropping index', index.name);
        await eventsCollection.dropIndex(index.name);
      }
    }
  }
  // ----------------- TAGS
  async function migrateTags (eventsCollection, streamsCollection) {
    const mall = await getMall();
    // get all users with tags
    const usersWithTag = await eventsCollection.distinct('userId', {
      tags: { $exists: true, $ne: null }
    });
    for (userId of usersWithTag) {
      const now = Date.now() / 1000;
      async function createStream (id, name, parentId) {
        try {
          await mall.streams.create(userId, {
            name,
            id,
            parentId,
            modifiedBy: 'migration',
            createdBy: 'migration',
            created: now,
            modified: now
          });
        } catch (e) {
          if (e.id !== 'item-already-exists') { throw e; } // already exists.. oK
        }
      }
      // create root stream
      await createStream(TAG_ROOT_STREAMID, 'Migrated Tags');
      // get all tags for user
      const tags = await eventsCollection.distinct('tags', { userId });
      for (tag of tags) {
        await createStream(TAG_PREFIX + tag, tag, TAG_ROOT_STREAMID);
        await migrateEvents(userId);
      }
      // migrate tags (add to streams for each event)
    }
    async function migrateEvents (userId) {
      eventsMigrated = 0;
      const cursor = eventsCollection.find({
        userId,
        tags: { $exists: true, $ne: [] }
      });
      let requests = [];
      let event;
      while (await cursor.hasNext()) {
        event = await cursor.next();
        if (event.tags == null) { continue; }
        const newStreams = event.tags
          .filter((t) => t != null)
          .map((t) => TAG_PREFIX + t);
        eventsMigrated++;
        requests.push({
          updateOne: {
            filter: { _id: event._id },
            update: {
              $addToSet: { streamIds: { $each: newStreams } },
              $unset: { tags: '' }
            }
          }
        });
        if (requests.length === 1000) {
          // Execute per 1000 operations and re-init
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
  async function migrateTagsAccesses (accessesCollection) {
    const cursor = accessesCollection.find({
      'permissions.tag': { $exists: true }
    });
    let requests = [];
    let accessesMigrated = 0;
    while (await cursor.hasNext()) {
      const access = await cursor.next();
      const newPermissions = [];
      const forcedStreams = [];
      for (const permission of access.permissions) {
        if (permission.tag == null) {
          newPermissions.push(permission);
          continue;
        }
        if (permission.level !== 'read') {
          const msg = 'Warning cannot migrate fully ' +
                        JSON.stringify(permission) +
                        ' accessId: ' +
                        access._id +
                        ' userId: ' +
                        access.userId;
          console.log(msg);
          // process.exit(0);
        }
        forcedStreams.push(TAG_PREFIX + permission.tag);
      }
      newPermissions.push({ feature: 'forcedStreams', streams: forcedStreams });
      accessesMigrated++;
      requests.push({
        updateOne: {
          filter: { _id: access._id },
          update: {
            $set: { permissions: newPermissions }
          }
        }
      });
      if (requests.length === 1000) {
        // Execute per 1000 operations and re-init
        await accessesCollection.bulkWrite(requests);
        console.log('Migrated ' + accessesMigrated + ' accesses for user ' + userId);
        requests = [];
      }
    }
    if (requests.length > 0) {
      await accessesCollection.bulkWrite(requests);
      console.log('Migrated ' + accessesMigrated + ' accesses for user ' + userId);
    }
  }
};
const eventsIndexes = [
  {
    index: { userId: 1 },
    options: {}
  },
  {
    index: { userId: 1, _id: 1 },
    options: {}
  },
  {
    index: { userId: 1, streamIds: 1 },
    options: {}
  },
  {
    index: { userId: 1, time: 1 },
    options: {}
  },
  {
    index: { userId: 1, streamIds: 1 },
    options: {}
  },
  // no index by content until we have more actual usage feedback
  {
    index: { userId: 1, trashed: 1 },
    options: {}
  },
  {
    index: { userId: 1, modified: 1 },
    options: {}
  },
  {
    index: { userId: 1, endTime: 1 },
    options: { partialFilterExpression: { endTime: { $exists: true } } }
  }
];
