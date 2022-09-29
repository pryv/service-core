/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * SQLite storage for per-user data such as:
 * - Password and password history
 * - Profile
 * The DB file is located in the root of each user account folder.
 *
 * TODO: This should be refactored and merged with Audit Storage and SQLite Event storage from branch
 * https://github.com/pryv/service-core/tree/test/sqlite-4-events
 * into a single "user-centric" storage
 */

const path = require('path');
const Sqlite3 = require('better-sqlite3');
const LRU = require('lru-cache');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const UserLocalDirectory = require('./UserLocalDirectory');

const CACHE_SIZE = 100;
const VERSION = '1.0.0';
const DB_OPTIONS = {};

let dbCache = null;

const InitStates = {
  NOT_INITIALIZED: -1,
  INITIALIZING: 0,
  READY: 1
};
let initState = InitStates.NOT_INITIALIZED;

module.exports = {
  init,
  addPassword,
  passwordExistsInHistory,
  passwordExistsInHistorySince
};

async function init () {
  while (initState === InitStates.INITIALIZING) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (initState === InitStates.READY) {
    return;
  }
  initState = InitStates.INITIALIZING;

  await UserLocalDirectory.init();

  dbCache = new LRU({
    max: CACHE_SIZE,
    dispose: function (db/* , key */) { db.close(); }
  });

  initState = InitStates.READY;
}

async function addPassword (userId, passwordHash, createdBy, time = timestamp.now()) {
  const db = await getUserDB(userId);
  const passwordId = cuid();
  const result = { passwordId, hash: passwordHash, time, createdBy };
  db.prepare('INSERT INTO passwords (passwordId, hash, time, createdBy) VALUES (@passwordId, @hash, @time, @createdBy)')
    .run(result);
  return result;
}

async function passwordExistsInHistory (userId, passwordHash, historyLength) {
  const db = await getUserDB(userId);
  const getLastN = db.prepare('SELECT hash, time FROM passwords ORDER BY time DESC LIMIT ?');
  for (const entry of getLastN.iterate(historyLength)) {
    if (entry.hash === passwordHash) return true;
  }
  return false;
}

// TODO consider removing (not needed?)
async function passwordExistsInHistorySince (userId, hash, sinceTime) {
  const db = await getUserDB(userId);
  const getHashSince = db.prepare('SELECT hash, time FROM passwords WHERE time >= @sinceTime AND hash = @hash');
  const result = getHashSince.get({ hash, sinceTime });
  return (result != null); // null or undefined
}

async function getUserDB (userId) {
  return dbCache.get(userId) || await openUserDB(userId);
}

async function openUserDB (userId) {
  const userPath = await UserLocalDirectory.ensureUserDirectory(userId);
  const dbPath = path.join(userPath, `account-${VERSION}.sqlite`);
  const db = new Sqlite3(dbPath, DB_OPTIONS);
  db.pragma('journal_mode = WAL');
  // db.pragma('busy_timeout = 0'); // We take care of busy timeout ourselves as long as current driver does not go bellow the second
  db.unsafeMode(true);
  db.prepare('CREATE TABLE IF NOT EXISTS passwords (passwordId TEXT PRIMARY KEY, hash TEXT NOT NULL, time REAL NOT NULL, createdBy TEXT NOT NULL);').run();
  db.prepare('CREATE INDEX IF NOT EXISTS passwords_hash ON passwords(hash);').run();
  db.prepare('CREATE INDEX IF NOT EXISTS passwords_time ON passwords(time);').run();
  db.prepare('CREATE INDEX IF NOT EXISTS passwords_time ON passwords(time);').run();
  dbCache.set(userId, db);
  return db;
}
