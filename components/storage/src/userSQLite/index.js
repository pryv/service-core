/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Storage = require('./Storage');

const storages = {};
/**
 *@returns {Promise<Storage>}
 */
async function getStorage (name) {
  if (!storages[name]) {
    storages[name] = new Storage(name);
    await storages[name].init();
  }
  return storages[name];
}

function closeStorage (name) {
  if (storages[name]) {
    storages[name].close();
    delete storages[name];
  }
}

module.exports = {
  getStorage,
  closeStorage
};
