/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const { getConfig } = require('@pryv/boiler');
let db;

async function getPlatformDB () {
  if (db != null) return db;
  if ((await getConfig()).get('storagePlatform:engine') === 'mongodb') {
    const DB = require('./DBmongodb');
    db = new DB();
  } else {
    const DB = require('./DBsqlite');
    db = new DB();
  }
  await db.init();
  return db;
}

module.exports = getPlatformDB;
