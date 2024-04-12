/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { getApplication } = require('api-server/src/application');
const { getUsersLocalIndex } = require('storage');

async function switchDB () {
  const mongo = require('../../userAccountStorageMongo');
  const sqlite = require('../../userAccountStorageSqlite');

  getApplication();

  await sqlite.init();
  await mongo.init();

  const userIndex = await getUsersLocalIndex();

  const allUsers = await userIndex.getAllByUsername();
  const allUsersIds = Object.values(allUsers);
  let migratedCount = 0;
  for (const userId of allUsersIds) {
    // --- password --- //
    const passwords = await sqlite._getPasswordHistory(userId);
    for (const password of passwords) {
      try {
        await mongo.addPasswordHash(userId, password.hash, password.time);
      } catch (e) {
        if (e.message.startsWith('E11000 duplicate key error collection: pryv-node-test.stores-key-value index: storeId_1_userId_1_key_1 dup key')) {
          console.log('Ignoring duplicate password for ' + userId + ' with time ' + password.time);
        } else {
          console.log('######');
          throw e;
        }
      }
    }
    if (passwords.length !== 0) {
      await sqlite.clearHistory(userId);
      console.log('migrated password history for ' + userId + ', items count: ' + passwords.length);
    }

    // --- store key values --//
    const storeKeyValues = await sqlite._getAllStoreData(userId);
    for (const i of storeKeyValues) {
      await mongo._addKeyValueData(i.storeId, i.userId, i.key, i.value);
      console.log(i.storeId, i.userId, i.key, i.value);
    }
    if (storeKeyValues.length !== 0) {
      await sqlite._clearStoreData(userId);
      console.log('migrated storeKeyValues history for ' + userId + ' with ' + storeKeyValues.length + ' items: ');
    }
    if (storeKeyValues.length !== 0 || passwords.length !== 0) {
      migratedCount++;
    }
  }
  console.log('Migrated ' + migratedCount + ' users over ' + allUsersIds.length);
  process.exit(0);
}

switchDB();
