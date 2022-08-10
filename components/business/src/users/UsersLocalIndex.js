/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Contains UserName >> UserId Mapping
 */

const mkdirp = require('mkdirp');
const sqlite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const cache = require('cache');

const userLocalIndexCheckIntegrity = require('./userLocalIndexCheckIntegrity');

const logger = getLogger('users:local-index');

class UsersLocalIndex {
  initialized;
  db;

  constructor () {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) { return; }
    this.initialized = true;

    this.db = new DBIndex();
    await this.db.init();

    logger.debug('init');
  }

  async checkIntegrity() {
    return userLocalIndexCheckIntegrity(this);
  }

  async addUser(username, userId) {
    this.db.addUser(username, userId);
    logger.debug('addUser', username, userId);
  }

  async existsUsername(username) {
    const res = (await this.idForName(username) != null);
    logger.debug('existsUsername', username, res);
    return res;
  }

  async idForName(username) {
    let userId = cache.getUserId(username);
    if (userId == null) {
      userId = this.db.getIdForName(username);
      if (userId != null) {
        cache.setUserId(username, userId);
      }
    }
    logger.debug('idForName', username, userId);
    return userId;
  }

  async nameForId(userId) {
    const res = this.db.getNameForId(userId);
    logger.debug('nameForId', userId, res);
    return res;
  }

  async allUsersMap() {
    logger.debug('allUsersMap');
    return this.db.allUsersMap();
  }

  // reset everything -- used by tests only
  async deleteAll() {
    logger.debug('deleteAll');
    cache.clear();
    return this.db.deleteAll();
  }

  async deleteById(userId) {
    logger.debug('deleteById', userId);
    return this.db.deleteById(userId);
  }
}

class DBIndex {
  db;
  queryId4Name;
  queryName4Id;
  queryAll;
  insertId4Name;
  deleteAllStmt;
  deleteWithId;

  constructor() { }

  async init() {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    this.db = new sqlite3(basePath + '/user-index.db');
    this.db.pragma('journal_mode = WAL');

    this.db.prepare('CREATE TABLE IF NOT EXISTS id4name (username TEXT PRIMARY KEY, userId TEXT NOT NULL);').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS id4name_id ON id4name(userId);').run();

    this.queryId4Name = this.db.prepare('SELECT userId FROM id4name WHERE username = ?');
    this.queryName4Id = this.db.prepare('SELECT username FROM id4name WHERE userId = ?');
    this.insertId4Name = this.db.prepare('INSERT INTO id4name (username, userId) VALUES (@username, @userId)');
    this.queryAll = this.db.prepare('SELECT username, userId FROM id4name');

    this.deleteWithId = this.db.prepare('DELETE FROM id4name WHERE userId = @userId');

    this.deleteAllStmt = this.db.prepare('DELETE FROM id4name');
  }

  getIdForName(username) {
    return this.queryId4Name.get(username)?.userId;
  }

  getNameForId(userId) {
    return this.queryName4Id.get(userId)?.username;
  }

  addUser(username, userId) {
    return this.insertId4Name.run({username, userId});
  }

  deleteById(userId) {
    return this.deleteWithId.run({userId});
  }

  allUsersMap() {
    const users = {};
    for (const user of this.queryAll.iterate()) {
      users[user.username] = user.userId;
    }
    return users;
  }

  deleteAll() {
    return this.deleteAllStmt.run();
  }
}


module.exports = new UsersLocalIndex();
