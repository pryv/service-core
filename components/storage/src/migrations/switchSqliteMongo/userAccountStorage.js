/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const { getApplication } = require('api-server/src/application');
const { getUsersLocalIndex } = require('storage');

async function switchDB () {
  const sqlite = require('../../userAccountStorageSqlite');
  const mongo = require('../../userAccountStorageMongo');

  getApplication();

  await sqlite.init();
  await mongo.init();

  const userIndex = await getUsersLocalIndex();

  const allUsers = await userIndex.getAllByUsername();
  const allUsersIds = Object.values(allUsers);
  let migratedCount = 0;
  for (const userId of allUsersIds) {
    const data = await sqlite._exportAll(userId);

    if (data.passwords.length !== 0 || data.storeKeyValues.length !== 0) {
      await mongo._importAll(userId, data);
      await sqlite._clearAll(userId);
      console.log('Migrated user ' + userId + ': ' + data.passwords.length + ' passwords, ' + data.storeKeyValues.length + ' storeKeyValues');
      migratedCount++;
    }
  }
  console.log('Migrated ' + migratedCount + ' users over ' + allUsersIds.length);
  process.exit(0);
}

switchDB();
