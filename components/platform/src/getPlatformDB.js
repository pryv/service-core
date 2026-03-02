/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const { getConfig } = require('@pryv/boiler');
const { validatePlatformDB } = require('storages/interfaces/platformStorage/PlatformDB');
const pluginLoader = require('storages/pluginLoader');

let db;

async function getPlatformDB () {
  if (db != null) return db;
  const config = await getConfig();
  await pluginLoader.init(config);
  const engine = pluginLoader.getEngineFor('platformStorage');
  const engineModule = pluginLoader.getEngineModule(engine);
  db = engineModule.createPlatformDB();
  await db.init();
  validatePlatformDB(db);
  return db;
}

module.exports = getPlatformDB;
