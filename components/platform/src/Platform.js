/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const mkdirp = require('mkdirp');
const sqlite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('platform');

const errors = require('errors').factory;

const { getServiceRegisterConn } = require('platform/src/service_register');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

/**
 * @class Platform
 * @property {Users} users
 */
class Platform {
  #initialized;
  #db;
  #serviceRegisterConn;

  constructor() {
    this.#initialized = false;
    this.#db = new PlatformWideDB();
  }

  async init() {
    if (this.#initialized) {
      logger.warn('Platform already initialized, skipping');
      return this;
    }
    this.initialized = true;
    const config = await getConfig();
    const isDnsLess = config.get('dnsLess:isActive');
    await this.#db.init();
    if (! isDnsLess) {
      this.#serviceRegisterConn = await getServiceRegisterConn();
    }

    return this;
  }

  // for tests only - called by repository 
  async deleteAll() {
    this.#db.reset();
  }

  /**
   * Get if value exists for this unique key
   * @param {string} field example 'email'
   * @param {string} value example 'bob@bob.com'
   * @returns {Promise<string | null>} the value if exists, null otherwise, example 'bob' 
   */
  async getUserUniqueField(field, value) {
    const key = 'user-unique/' + field + '/' + value;
    $$('Forward this request to register');
    return this.#db.getOne(key);
  }

  /**
   * @private as long as we don't use a distributed db. 
   * Set a unique key for this value. 
   * @see updateUserAndForward to change a unique field
   * @param {string} field example 'email'
   * @param {string} value example 'bob@bob.com'
   * @param {string} username 
   */
  async #setUserUniqueField(username, field, value) {
    const key = 'user-unique/' + field + '/' + value;
    this.#db.set(key, username);
  }

  /**
   * @private as long as we don't use a distributed db. 
   * @see updateUserAndForward to delete a unique field
   * Delete a unique key for this user. 
   * @param {string} field example 'email'
   * @param {string} value example 'bob@bob.com'
   */
   async #deleteUserUniqueField(field, value) {
    const key = 'user-unique/' + field + '/' + value;
    this.#db.delete(key);
  }

  /**
   * @private as long as we don't use a distributed db. 
   * @see updateUserAndForward to delete an indexed field
   * Set a user indexed field. 
   * Mock etcd implementation of prefixes 
   * @param {*} username 
   * @param {*} operations 
   * @param {*} isActive 
   * @param {*} isCreation 
   */
  async #setUserIndexedField(username, field, value) {
    const key = 'user-indexed/' + field + '/' + username;
    this.#db.set(key, value);
  }

  async #deleteUserIndexedField(username, field) {
    const key = 'user-indexed/' + field + '/' + username;
    this.#db.delete(key);
  }

  async updateUserAndForward(username, operations, isActive, isCreation, skipFowardToRegister = false) {
    await this.#updateUser(username, operations, isActive, isCreation);
    if (skipFowardToRegister) return; // in fixture tests
    if (this.#serviceRegisterConn != null) {
      const ops2 = operations.map(op => {
        const action = op.action == 'delete' ? 'delete' : 'update';
        return {[action]: {key: op.key, value: op.value, isUnique: op.isUnique}};
      });
      await this.#serviceRegisterConn.updateUserInServiceRegister(username, ops2, isActive, isCreation);
    }
  }

  /**
   * @private as long as we don't use a distributed db. 
   * @see updateUserAndForward to update an user
   * Replace updateUserInServiceRegister()
   * @param {*} key 
   */
  async #updateUser(username, operations, isActive, isCreation) {
    // otherwise deletion
    for (const op of operations) {
      switch (op.action) {
        case 'create':
          if (op.isUnique) {
            const potentialCollisionUsername = await this.getUserUniqueField(op.key, op.value);
            if (potentialCollisionUsername !== null && potentialCollisionUsername !== username) {
              throw (errors.itemAlreadyExists('user', { [op.key]: op.value }));
            }
            await this.#setUserUniqueField(username, op.key, op.value);
          } else { // is Indexed
            await this.#setUserIndexedField(username, op.key, op.value);
          }
          break;

        case 'update':
          if (op.isUnique) {
            const existingUsernameValue = await this.getUserUniqueField(op.key, op.previousValue);
            if (existingUsernameValue !== null && existingUsernameValue === username) {
              // only delete eventual existing value if it is the same user
              await this.#deleteUserUniqueField(op.key, op.previousValue);
            }
          
            const potentialCollisionUsername = await this.getUserUniqueField(op.key, op.value);
            if (potentialCollisionUsername !== null && potentialCollisionUsername !== username) {
              throw (errors.itemAlreadyExists('user', { [op.key]: op.value }));
            }
            await this.#setUserUniqueField(username, op.key, op.value);
          } else { // is Indexed
            await this.#deleteUserUniqueField(op.key, op.previousValue);
            await this.#setUserIndexedField(username, op.key, op.value);
          }
          break;

        case 'delete':
          if (op.isUnique) {
            const existingValue = await this.getUserUniqueField(op.key, op.value);
            if (existingValue !== null && existingValue !== username) {
              throw (errors.forbidden('unique field ' + op.key + ' with value ' + op.value + ' is associated to another user'));
            }
            if (existingValue != null) {
              await this.#deleteUserUniqueField(op.key, op.value);
            }
          } else { // is Indexed
            await this.#deleteUserIndexedField(username, op.key);
          }
          break;

        default:
          throw new Error('Unknown action');
          break;
      }
    }
  }

  /**
   * Fully delete a user
   * @param {string} username
   * @param {[User]} User -- // for some tests User might be null
   */
  async deleteUser(username, user) {
    // unique fields
    const operations = [];
    if (user != null) { // cannot delete unique keys if user is null! (as the current value is needed)
      for (const field of SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix()) {
        operations.push({action: 'delete', key: field, value: user[field], isUnique: true});
      }
    }
    
    // indexed fields
    for (const field of SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix()) {
      operations.push({action: 'delete', key: field, isUnique: false});
    }

    await this.#updateUser(username, operations, false, false);

    // forward to register
    if (this.#serviceRegisterConn) {
      try {
        const res = await this.#serviceRegisterConn.deleteUser(username);
        logger.debug('on register: ' + username, res);
      } catch (e) { // user might have been deleted register we do not FW error just log it
        logger.error(e);
      }
    }

  }

  // ----------------  Simple abstractions for service register calls (to be removed)  ----------------

  /**
   * Check if username is available (FW to service register)
   */
  async isUsernameReserved(username) {
    if (this.#serviceRegisterConn) {
      const response = await serviceRegisterConn.checkUsername(username);
      if (response.reserved === true) {
        return true;
      } 
      return false;
    }
  }

  /**
   * Validate user and pre-register it (FW to service register)
   */
  async createUserStep1_ValidateUser(username, invitationToken, uniqueFields, hostname) {
    await this.#serviceRegisterConn.validateUser(username, invitationToken, uniqueFields, hostname);
  }

  /**
   * Validate user and pre-register it (FW to service register)
   */
   async createUserStep2_CreateUser(userData) {
    await this.#serviceRegisterConn.createUser(userData);
  }



}

class PlatformWideDB {
  db;
  queryUniqueKey;
  upsertUniqueKeyValue;
  deleteAll;

  constructor() { }

  async init() {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    const DB_OPTIONS = {};
    this.db = new sqlite3(basePath + '/platform-wide.db');
    this.db.pragma('journal_mode = WAL');

    this.db.prepare('CREATE TABLE IF NOT EXISTS uniqueKeys (key TEXT PRIMARY KEY, value TEXT NOT NULL);').run();


    // in the following query see the trick to pass a list of values as parameter
    this.queryUniqueKey = this.db.prepare('SELECT key, value FROM uniqueKeys WHERE key = ?');
    this.upsertUniqueKeyValue = this.db.prepare('INSERT OR REPLACE INTO uniqueKeys (key, value) VALUES (@key, @value);');
    this.deleteUniqueKey = this.db.prepare('DELETE FROM uniqueKeys WHERE key = ?;');
    this.deleteAll = this.db.prepare('DELETE FROM uniqueKeys;');
  }

  getOne(key) {
    const value = this.queryUniqueKey.all(key);
    const res = (value.length === 0) ? null : value[0].value;
    logger.debug('db:getOne', key, res);
    return res;
  }

  getWithPrefix(prefix) {

    return [];
  }

  /**
   * 
   * @param {string} key
   * @param {string} value 
   * @returns 
   */
  set(key, value) {
    logger.debug('db:set', key, value);
    return this.upsertUniqueKeyValue.run({ key, value });
  }

  delete(key) {
    logger.debug('db:delete', key);
    return this.deleteUniqueKey.run(key);
  }

  reset() {
    logger.debug('db:reset');
    this.deleteAll.run();
  }

}


module.exports = new Platform();