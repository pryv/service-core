/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository } = require('business/src/users/repository');
const { getLogger } = require('@pryv/boiler');
const getPlatformDB = require('platform/src/getPlatformDB');

/**
 * v1.7.5:
 * - migrate system streamIds in access permissions
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.8.0');
  logger.info('V1.7.5 => v1.8.0 Migration started');
  await SystemStreamsSerializer.init();
  const eventsCollection = await context.database.getCollection({
    name: 'events'
  });
  try {
    await setAllTrashed();
    await migrateUserids();
    await migratePasswords();
    await migrateIndexedFieldsToPlatform();
    await setAllTrashed();
  } catch (e) {
    return callback(e);
  }

  logger.info('V1.7.5 => v1.8.0 Migration finished');
  callback();

  async function setAllTrashed () { // Check this!
    await eventsCollection.updateMany({ trashed: null, deleted: null }, { $set: { trashed: false } });
  }

  async function migrateUserids () {
    const usersIndex = await require('storage').getUsersLocalIndex();
    const query = { streamIds: { $in: [':_system:username'] } };
    const cursor = eventsCollection.find(query, {
      projection: { _id: 1, userId: 1, content: 1 }
    });
    while (await cursor.hasNext()) {
      const event = await cursor.next();
      await usersIndex.addUser(event.content, event.userId);
      await eventsCollection.deleteMany({ userId: event.userId, _id: event._id });
      logger.info('Migrating userId: ' + event.userId + ' username: ' + event.content);
    }
  }

  async function migratePasswords () {
    const userAccountStorage = await require('storage').getUserAccountStorage();
    const query = { streamIds: { $in: [':_system:passwordHash'] } };
    const cursor = await eventsCollection.find(query, { projection: { _id: 1, userId: 1, content: 1, created: 1, createdBy: 1 } });
    while (await cursor.hasNext()) {
      const event = await cursor.next();
      await userAccountStorage.addPasswordHash(event.userId, event.content, event.createdBy || 'system', event.created);
      await eventsCollection.deleteMany({ userId: event.userId, _id: event._id });
      logger.info('Migrating password for userId: ' + event.userId);
    }
  }

  async function migrateIndexedFieldsToPlatform () {
    const platformWideDB = await getPlatformDB();
    // Retrieve all existing users
    const usersRepository = await getUsersRepository();
    const users = await usersRepository.getAll();
    const indexedFields = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix();
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const username = user.username;
      logger.info(' migrating ' + indexedFields.length + ' fields for userId: ' + user.id);
      for (const field of indexedFields) {
        const value = user[field];
        if (value == null) { continue; }
        const isUnique = SystemStreamsSerializer.isUniqueAccountField(field);
        function logDebug (txt) {
          logger.debug('platform: user <' +
                        user.username +
                        '> field: <' +
                        field +
                        '> value: <' +
                        user[field] +
                        '> unique: <' +
                        isUnique +
                        '> => ' +
                        txt);
        }
        if (isUnique) {
          const currentUsername = await platformWideDB.getUsersUniqueField(field, value);
          if (currentUsername === username) {
            logDebug('skip');
            continue;
          } // already set
          if (currentUsername != null) {
            throw new Error('Error while migrating user unique field to user: ' +
                            username +
                            ', value: ' +
                            value +
                            ' is already associated with user: ' +
                            currentUsername);
          }
          await platformWideDB.setUserUniqueField(username, field, value);
          logDebug('set unique');
        } else {
          const currentValue = await platformWideDB.getUserIndexedField(username, field);
          if (currentValue === value) {
            logDebug('skip');
            continue;
          } // already set
          if (currentValue != null) {
            throw new Error('Error while migrating user indexed field to user: ' +
                            username +
                            ', value: ' +
                            value +
                            ' is already set to : ' +
                            currentValue);
          }
          await platformWideDB.setUserIndexedField(username, field, value);
          logDebug('set indexed');
        }
      }
    }
  }
};
