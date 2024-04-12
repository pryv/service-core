/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
