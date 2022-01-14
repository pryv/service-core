/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Contains UserName >> UserId Mapping
 */

const cuid = require('cuid');
const bluebird = require('bluebird');
const mkdirp = require('mkdirp');
const sqlite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const cache = require('cache');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const logger = getLogger('users:local-index');

class UserLocalIndex {
  eventsStorage;
  collectionInfo;
  initialized;
  db;

  constructor () {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) { return };
    this.initialized = true;

    this.db = new DBIndex();
    await this.db.init();

    const storage = require('storage');
    const storageLayer = await storage.getStorageLayer();
    this.eventsStorage = storageLayer.events;
    this.collectionInfo = this.eventsStorage.getCollectionInfoWithoutUserId();
  }

  async addUser(username, userId) {
    this.db.addUser(username, userId);
  }

  async existsUsername(username) {
    return (await this.idForName(username) != null);
  }

  async idForName(username) {
    let userId = cache.getUserId(username);
    if (! userId) {
      userId = this.db.getIdForName(username);
      cache.setUserId(username, userId);
    }
    return userId;
  }

  async nameForId(userId) {
    return this.db.getNameForId(userId);
  }

  async allUsersMap() {
    return this.db.allUsersMap();
  }

  // reset everything -- used by tests only 
  async deleteAll() {
    return this.db.deleteAll();
  }
}

class DBIndex {
  db;
  queryId4Name;
  queryName4Id;
  queryAll;
  insertId4Name;
  deleteAllStmt;

  constructor() { }

  async init() {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    const DB_OPTIONS = {};
    this.db = new sqlite3(basePath + '/user-index.db');
    this.db.pragma('journal_mode = WAL');
    
    this.db.prepare('CREATE TABLE IF NOT EXISTS id4name (username TEXT PRIMARY KEY, userId TEXT NOT NULL);').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS id4name_id ON id4name(userId);').run();

    this.queryId4Name = this.db.prepare('SELECT userId FROM id4name WHERE username = ?');
    this.queryName4Id = this.db.prepare('SELECT username FROM id4name WHERE userId = ?');
    this.insertId4Name = this.db.prepare('INSERT INTO id4name (username, userId) VALUES (@username, @userId)');
    this.queryAll = this.db.prepare('SELECT username, userId FROM id4name');

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


module.exports = new UserLocalIndex();