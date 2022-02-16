/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Storage = require('./Storage');

let storage;
/**
 *@returns {Storage}
 */
async function getStorage() {
  if (! storage) {
    storage = new Storage('audit');
    await storage.init();
  }
  return storage;
}

function closeStorage() {
  if (storage) {
    storage.close();
    storage = null;
  }
}

module.exports = {
  getStorage: getStorage,
  closeStorage: closeStorage
}