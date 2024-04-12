/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Database = require('storage').Database;

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('platform:db');

class DB {
  platformUnique;
  platformIndexed;
  queries;
  db;

  async init () {
    const settings = structuredClone((await getConfig()).get('database'));
    settings.name = settings.name + '-platform';
    this.db = new Database(settings);
    this.platformUnique = await this.db.getCollection({
      name: 'keyValueUnique',
      indexes: [
        {
          index: { field: 1, value: 1 },
          options: { unique: true }
        }
      ]
    });
    this.platformIndexed = await this.db.getCollection({
      name: 'keyValueIndexed',
      indexes: [
        {
          index: { username: 1, field: 1 },
          options: { unique: true }
        },
        {
          index: { field: 1 },
          options: { }
        }
      ]
    });
    logger.debug('PlatformDB (mongo) initialized');
  }

  /** Used by platformCheckIntegrity  */
  async getAllWithPrefix (prefix) {
    logger.debug('getAllWithPrefix', prefix);
    if (prefix !== 'user') throw new Error('Only [user] prefix is supported');
    const res = (await this.platformIndexed.find({}).toArray()).map((i) => { i.isUnique = false; return i; });
    const uniques = (await this.platformUnique.find({}).toArray()).map((i) => { i.isUnique = true; return i; });
    res.push(...uniques);
    logger.debug('getAllWithPrefixDone', prefix);
    return res;
  }

  /** Used by tests  */
  async deleteAll () {
    logger.debug('deleteAll');
    await this.platformIndexed.deleteMany({});
    await this.platformUnique.deleteMany({});
  }

  // ----- utilities ------- //

  async setUserUniqueField (username, field, value) {
    const item = { field, value, username };
    logger.debug('setUserUniqueField', item);
    await this.platformUnique.updateOne({ field, value }, { $set: item }, { upsert: true });
    return item;
  }

  async deleteUserUniqueField (field, value) {
    logger.debug('deleteUserUniqueField', { field, value });
    await this.platformUnique.deleteOne({ field, value });
  }

  async setUserIndexedField (username, field, value) {
    const item = { field, value, username };
    logger.debug('setUserIndexedField', item);
    await this.platformIndexed.updateOne({ field, username }, { $set: item }, { upsert: true });
  }

  async deleteUserIndexedField (username, field) {
    logger.debug('deleteUserIndexedField', { username, field });
    await this.platformIndexed.deleteOne({ username, field });
  }

  async getUserIndexedField (username, field) {
    logger.debug('getUserIndexedField', { username, field });
    const res = await this.platformIndexed.findOne({ username, field });
    return res?.value || null;
  }

  async getUsersUniqueField (field, value) {
    logger.debug('getUsersUniqueField', { field, value });
    const res = await this.platformUnique.findOne({ field, value });
    return res?.username || null;
  }

  async close () {
    await this.db.close();
    this.db = null;
  }

  isClosed () {
    return this.db == null;
  }
}

module.exports = DB;
