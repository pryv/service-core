/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * UserAccountStorage is the container of per-user data like
 * - Password and password history
 * - Profile
 * It's located at the root of a each user account
 *
 * !! This should be refactored and merged with Audit Storage and SQLite Event storage from branch
 * https://github.com/pryv/service-core/tree/test/sqlite-4-events
 * In a single UserCentricStorage
 */

const path = require('path');

const Sqlite3 = require('better-sqlite3');
const LRU = require('lru-cache');
const UserLocalDirectory = require('./UserLocalDirectory');
const cuid = require('cuid');

const CACHE_SIZE = 100;
const VERSION = '1.0.0';
const DB_OPTIONS = {};

let dbCache = null;
let initialized = -1; // -1 not initialized, 0 initializing , 1 initialized
async function init () {
  while (initialized === 0) { await new Promise((resolve) => setTimeout(resolve, 50))};
  if (initialized === 1) return;
  initialized = 0;

  await UserLocalDirectory.init();

  dbCache = new LRU({
    max: CACHE_SIZE,
    dispose: function (db, key) { db.close(); }
  });
  initialized = 1;
}

async function passwordSetHash (userId, hash, createdBy, time = Date.now() / 1000) {
  const db = await getUserAccountStorage(userId);
  const passwordId = cuid();
  const result = { passwordId, hash, time, createdBy };
  db.prepare('INSERT INTO passwords (passwordId, hash, time, createdBy) VALUES (@passwordId, @hash, @time, @createdBy)').run(
    result
  );
  return result; 
}

async function passwordHashExistsInHistory (userId, hash, checkAgainstNLasts) {
  const db = await getUserAccountStorage(userId);
  const getLastN = db.prepare('SELECT hash, time FROM passwords ORDER BY time DESC LIMIT ?');
  for (const entry of getLastN.iterate(checkAgainstNLasts)) {
    if (entry.hash === hash) return true;
  }
  return false;
}

async function passwordHashExistsInHistorySince (userId, hash, sinceTime) {
  const db = await getUserAccountStorage(userId);
  const getHashSince = db.prepare('SELECT hash, time FROM passwords WHERE time >= @sinceTime AND hash = @hash');
  const result = getHashSince.get({hash, sinceTime});
  return (result != null); // null or undefined
}

async function getUserAccountStorage (userId) {
  return dbCache.get(userId) || await openUserAccountStorage(userId);
}

async function openUserAccountStorage (userId) {
  const userPath = await UserLocalDirectory.ensureUserDirectory(userId);
  const dbPath = path.join(userPath, 'account-' + VERSION + '.sqlite');
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

module.exports = {
  init,
  passwordSetHash,
  passwordHashExistsInHistory,
  passwordHashExistsInHistorySince
};
