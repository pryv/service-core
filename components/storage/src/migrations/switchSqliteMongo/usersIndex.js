/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { getApplication } = require('api-server/src/application');

async function switchDB () {
  const MongoDB = require('../../usersLocalIndexMongoDB');
  const SqliteDB = require('../../usersLocalIndexSQLite');
  const mongo = new MongoDB();
  const sqlite = new SqliteDB();

  getApplication();

  await sqlite.init();
  await mongo.init();

  const allUsers = await sqlite.getAllByUsername();

  let migratedCount = 0;
  for (const [username, userId] of Object.entries(allUsers)) {
    await mongo.addUser(username, userId);
    await sqlite.deleteById(userId);
    migratedCount++;
  }
  console.log('Migrated ' + migratedCount + ' users');
  process.exit(0);
}

switchDB();
