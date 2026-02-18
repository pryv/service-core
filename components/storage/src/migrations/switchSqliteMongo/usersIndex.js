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

  const data = await sqlite.exportAll();
  await mongo.importAll(data);

  const migratedCount = Object.keys(data).length;
  await sqlite.clearAll();
  console.log('Migrated ' + migratedCount + ' users');
  process.exit(0);
}

switchDB();
