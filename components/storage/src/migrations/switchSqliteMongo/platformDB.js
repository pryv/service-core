/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
// prototype, run the following command to test
// node components/platform/src/switch1.9.0sqlite-mongo.js --config config/api.yml

const { getApplication } = require('api-server/src/application');

async function switchDB () {
  const Sqlite = require('storages/engines/sqlite/src/DBsqlite');
  const Mongo = require('storages/engines/mongodb/src/DBmongodb');

  getApplication();

  const sqlite = new Sqlite();
  await sqlite.init();
  const mongo = new Mongo();
  await mongo.init();

  const data = await sqlite.exportAll();
  await mongo.importAll(data);
  await sqlite.clearAll();

  console.log('Transferred to mongo ' + data.length + ' entries');
  process.exit(0);
}

switchDB();
