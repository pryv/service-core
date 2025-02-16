/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const mkdirp = require('mkdirp');
const SQLite3 = require('better-sqlite3');
const concurrentSafeWrite = require('./sqliteUtils/concurrentSafeWrite');

const { getConfig } = require('@pryv/boiler');

class DBIndex {
  db;
  queryGetIdForName;
  queryGetNameForId;
  queryGetAll;
  queryInsert;
  queryDeleteAll;
  queryDeleteById;

  async init () {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    this.db = new SQLite3(basePath + '/user-index.db');
    await concurrentSafeWrite.initWALAndConcurrentSafeWriteCapabilities(this.db);

    concurrentSafeWrite.execute(() => {
      this.db.prepare('CREATE TABLE IF NOT EXISTS id4name (username TEXT PRIMARY KEY, userId TEXT NOT NULL);').run();
    });
    concurrentSafeWrite.execute(() => {
      this.db.prepare('CREATE INDEX IF NOT EXISTS id4name_id ON id4name(userId);').run();
    });

    this.queryGetIdForName = this.db.prepare('SELECT userId FROM id4name WHERE username = ?');
    this.queryGetNameForId = this.db.prepare('SELECT username FROM id4name WHERE userId = ?');
    this.queryInsert = this.db.prepare('INSERT INTO id4name (username, userId) VALUES (@username, @userId)');
    this.queryGetAll = this.db.prepare('SELECT username, userId FROM id4name');
    this.queryDeleteById = this.db.prepare('DELETE FROM id4name WHERE userId = @userId');
    this.queryDeleteAll = this.db.prepare('DELETE FROM id4name');
  }

  async getIdForName (username) {
    return this.queryGetIdForName.get(username)?.userId;
  }

  async getNameForId (userId) {
    return this.queryGetNameForId.get(userId)?.username;
  }

  async addUser (username, userId) {
    let result = null;
    await concurrentSafeWrite.execute(() => {
      result = this.queryInsert.run({ username, userId });
    });
    return result;
  }

  async deleteById (userId) {
    await concurrentSafeWrite.execute(() => {
      return this.queryDeleteById.run({ userId });
    });
  }

  /**
   * @returns {Object} An object whose keys are the usernames and values are the user ids.
   */
  async getAllByUsername () {
    const users = {};
    for (const user of this.queryGetAll.iterate()) {
      users[user.username] = user.userId;
    }
    return users;
  }

  async deleteAll () {
    concurrentSafeWrite.execute(() => {
      return this.queryDeleteAll.run();
    });
  }
}

module.exports = DBIndex;
