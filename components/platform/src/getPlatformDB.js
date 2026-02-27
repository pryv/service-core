/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const { getConfig } = require('@pryv/boiler');
const { validatePlatformDB } = require('./interfaces/PlatformDB');
const getStorageEngine = require('storage/src/getStorageEngine');

let db;

async function getPlatformDB () {
  if (db != null) return db;
  const config = await getConfig();
  const engine = getStorageEngine(config, 'storagePlatform');
  switch (engine) {
    case 'mongodb': {
      const DB = require('./DBmongodb');
      db = new DB();
      break;
    }
    case 'postgresql': {
      const DB = require('./DBpostgresql');
      db = new DB();
      break;
    }
    default: {
      // sqlite (default)
      const DB = require('./DBsqlite');
      db = new DB();
      break;
    }
  }
  await db.init();
  validatePlatformDB(db);
  return db;
}

module.exports = getPlatformDB;
