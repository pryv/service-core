/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Contains UserName >> UserId Mapping
 */

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

  async idForName(username) {
    let userId = cache.getUserId(username);
    if (! userId) {
      const userIdEvent = await bluebird.fromCallback(
        cb => this.eventsStorage.database.findOne(
          this.collectionInfo,
          this.eventsStorage.applyQueryToDB(
            {
              $and: [
                {
                  streamIds: {
                    $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME],
                  },
                },
                { content: { $eq: username } },
              ],
            },
          ),
          null,
          cb,
        ),
      );
      userId = userIdEvent?.userId;
      cache.setUserId(username, userId);
    }
    return userId;
  }
}

class DBIndex {
  db;
  queryId4Name;
  insertId4Name;

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
    this.insertId4Name = this.db.prepare('INSERT INTO id4name (username, userId) VALUES (@username, @userId)');
  }

  async getIdForName(username) {
    return this.queryId4Name.get(username).userId;
  }

  async setIdForName(username, userId) {
    return this.insertId4Name.run({username, userId});
  }
}


module.exports = new UserLocalIndex();