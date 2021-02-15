/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const mkdirp = require('mkdirp').sync;
const LRU = require('lru-cache');
const UserDatabase = require('./UserDatabase');
const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('Storage');

const MAX_SIZE_CACHE = 500;

class Storage { 
  initialized = false;
  userDBsCache = null;
  basePath = null;
  options = null;

  async init() {
    if (this.initialized) {
      throw('Database already initalized');
    } 

    this.config = await getConfig();
    this.basePath = this.config.get('audit:storage:path');
    if (! this.basePath) {
      throw('Mising database:path config setting');
    }
    mkdirp(this.basePath);
    logger.debug('Db initalized');
    this.initialized = true;
    return this;
  }

  constructor(options) { 
    this.options = options || {}; 
    this.userDBsCache = new LRU({
      max: this.options.max || MAX_SIZE_CACHE,
      dispose: function (key, db) { db.close(); }
    });
  }

  /**
   * @throws if not initalized
   */
  checkInititalized() {
    if (! this.initialized) throw('Initialize db component before using it');
  }

  /**
   * get the database relative to a specific user
   * @param {string} userid 
   * @returns {UserDatabase} 
   */
  forUser(userid) {
    logger.debug('forUser: ' + userid);
    this.checkInititalized();
    return this.userDBsCache.get(userid) || open(this, userid);
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.reset();
  }
}

function open(storage, userid) {
  logger.debug('open: ' + userid);
  const db = new UserDatabase({dbPath: dbPathForUserid(storage.basePath, userid)});
  storage.userDBsCache.set(userid, db);
  return db;
}


 /**
 * @param {string} uid -- user id (cuid format)
 */
function dbPathForUserid(basePath, userid) {
  const dir1 = userid.substr(userid.length - 1, 1); // last character of id
  const dir2 = userid.substr(userid.length - 2, 1); // before last character of id
  mkdirp(path.join(basePath, dir2, dir1)); // ensure directory exists
  return path.join(basePath, dir2, dir1, userid + '.sqlite');
}



module.exports = Storage;