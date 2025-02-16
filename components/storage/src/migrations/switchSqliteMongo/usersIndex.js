/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
