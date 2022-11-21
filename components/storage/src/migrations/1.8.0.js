/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository } = require('business/src/users/repository');

const { getLogger } = require('@pryv/boiler');

const DOT: string = '.';
import type { Permission } from 'business/src/accesses';

const PlatformWideDB = require('platform/src/DB');

/**
 * v1.7.5:
 * - migrate system streamIds in access permissions
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.8.0');
  logger.info('V1.7.5 => v1.8.0 Migration started');

  await SystemStreamsSerializer.init();
  const eventsCollection = await context.database.getCollection({ name: 'events' });

  try {
    await migrateUserids();
    await migrateIndexedFieldsToPlatform();
  } catch (e) {
    return callback(e);
  }

  logger.info('V1.7.5 => v1.8.0 Migration finished');
  callback();

  async function setAllTrashed() {
    await eventsCollection.updateMany({trashed: null, deleted: null}, {$set: {trashed: false}});
  }

  async function migrateUserids() {
    const usersIndex = require('business/src/users/UsersLocalIndex');
    await usersIndex.init();
    const query =  { streamIds: { $in: [':_system:username'] } };
    const cursor = eventsCollection.find(query, {projection: {userId: 1, content: 1}});
    while (await cursor.hasNext()) {
      const user = await cursor.next();
      await usersIndex.addUser(user.content, user.userId);
    }
  }

  async function migrateIndexedFieldsToPlatform() {
    const platformWideDB = new PlatformWideDB();
    await platformWideDB.init();

     // Retrieve all existing users
    const usersRepository = await getUsersRepository();
    const users = await usersRepository.getAll();
    const indexedFields = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const username = user.username;
      for (const field of indexedFields) {
        const value = user[field];
        if (value == null) continue;
        const isUnique = SystemStreamsSerializer.isUniqueAccountField(field);

        function logDebug(txt) {
         logger.debug('platform: user <' + user.username + '> field: <' + field + '> value: <' + user[field] + '> unique: <' + isUnique+ '> => ' + txt);
        }

        if (isUnique) {
          const currentUsername = await platformWideDB.getUsersUniqueField(field, value);
          if (currentUsername == username) { logDebug('skip'); continue }; // already set
          if (currentUsername != null) throw(new Error('Error while migrating user unique field to user: ' + username + ', value: ' + value + ' is already associated with user: ' + currentUsername));
          await platformWideDB.setUserUniqueField(username, field, value);
          logDebug('set unique');

        } else {
          const currentValue = await platformWideDB.getUserIndexedField(username, field);
          if (currentValue == value) { logDebug('skip'); continue }; // already set
          if (currentValue != null) throw(new Error('Error while migrating user indexed field to user: ' + username + ', value: ' + value + ' is already set to : ' + currentValue));
          await platformWideDB.setUserIndexedField(username, field, value);
          logDebug('set indexed');
        }

      }
    }

    await platformWideDB.close();
  }

};
