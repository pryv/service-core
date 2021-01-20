/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Plugin to run at the end of the config loading.
 * Should validate (or not) the configuration and display appropriate messages
 */

const { getLogger } = require('boiler');
let logger; // initalized at load();

async function validate(store) {
  // check for incomplete settings
  checkIncompleteFields(store.get(), []);
}

/**
 * Parse all string fields and fail if "REPLACE" is found 
 * stops if an "active: false" field is found in path 
 */
function checkIncompleteFields(obj, parentPath, key) {
  const path = key ? parentPath.concat(key) : parentPath;
  if (typeof obj === 'undefined' || obj === null) return;
  if (typeof obj === 'string') {
    if (obj.includes('REPLACE'))
      failWith('field content should be replaced', path, obj);
  }
  if (typeof obj === 'object') {
    if (obj.active && ! obj.active) return; // skip non active fields
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        checkIncompleteFields(obj[i], path, i);
      }
    } else {
      for (let k of Object.keys(obj)) {
        checkIncompleteFields(obj[k], path, k);
      }
    }
  }
}


/**
 * Throw an error with the necessary information
 * @param {string} message 
 * @param {Array<string>} 
 * @param {*} payload 
 */
function failWith(message, path, payload) {
  path = path || [];
  const error = new Error('Configuration is invalid at [' + path.join(':') + '] ' + message);
  error.payload = payload;
  throw(error);
}


module.exports = {
  load: async function (store) {
    logger = getLogger('validate-config');
    try {
      await validate(store);
    } catch (e) {
      logger.error(e.message, e.payload);
      process.exit(1);
    }
  }
}