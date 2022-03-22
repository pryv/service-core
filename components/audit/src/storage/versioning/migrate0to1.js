/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// Migration of v0 to 1 is done in the following steps:
// 1. Open v0
// 2. Copy events to v1
// 3. Delete v0 file

// We cannot simply update the schema as we cannot alter NULLABLE state of columns

// changes:
// - renamed duration to endTime
// - added deleted
// - added attachments
// changed most of the fields to be nullable
// - added headId

const sqlite3 = require('better-sqlite3');
const unlinkFilePromise = require('fs/promises').unlink;
const path = require('path');
const fs = require('fs');
const { getLogger } = require('@pryv/boiler');
const UserLocalDirectory = require('business').users.UserLocalDirectory;
const UserDatabase = require('../UserDatabase');

const logger =  getLogger('sqlite-storage-migration:migrate0to1');

async function migrate0to1(v0dbPath, v1user, logger) {
  const v0db = new sqlite3(v0dbPath);
  const v0EventsIterator = v0db.prepare('SELECT * FROM events').iterate();
  const res = {
    count : 0,
  }
  v1user.db.exec('BEGIN');
  for (let eventData of v0EventsIterator) {
    eventData.id = eventData.eventid;
    delete eventData.eventid;

    if (eventData.duration) { // NOT null, 0, undefined
      eventData.endTime = eventData.time + eventData.duration; 
    } else { 
      eventData.endTime = eventData.time;
    }
   
    if (eventData.streamIds != null) {
      eventData.streamIds = eventData.streamIds.split(' ');
    } 

    if (eventData.content != null) {
      eventData.content = JSON.parse(eventData.content);
    }
    delete eventData.duration;
    res.count++;
    v1user.createEventSync(eventData);
  }
  v1user.db.exec('COMMIT');

  v0db.close();
  await unlinkFilePromise(v0dbPath);
  return res;
}

async function checkAllUsers(storage) {
  const userDir = UserLocalDirectory.getBasePath();
  const auditDBVersionFile = path.join(userDir, 'audit-db-version-' + storage.getVersion() + '.txt'); 
  if (fs.existsSync(auditDBVersionFile)) {
    logger.debug('Audit db version file found, skipping migration for ' + storage.getVersion());
    return;
  }

  const counts = {
    done: 0,
    skip: 0
  };

  await UserLocalDirectory.foreachUserDirectory(checkUserDir, userDir, logger);
  logger.info('Done with migration for ' + storage.getVersion() + ': ' + counts.done + ' done, ' + counts.skip + ' skipped');

  await fs.writeFileSync(auditDBVersionFile, 'DO NOT DELETE THIS FILE - IT IS USED TO DETECT MIGRATION SUCESS');

  async function checkUserDir(userId, userDir) {
    // check if a migration from a non upgradeable schema (copy file to file) is needed
    const v0dbPath = await storage._dbPathForUserid(userId, '');
  
    if (! fs.existsSync(v0dbPath)) {
      logger.info('OK for ' + userId);
      counts.skip++;
      return; // skip as file exists
    };

    const v1dbPath = await storage.dbPathForUserid(userId);
    if (fs.existsSync(v1dbPath)) {
      logger.error('ERROR: Found V0 and V1 database for: ' + userId + '>>> Manually delete one of the version in: ' + userDir);
      process.exit(1);
    };

    const v1user = new UserDatabase(logger, {dbPath: v1dbPath});
   
    try {
      await v1user.init();
      const resMigrate = await migrate0to1(v0dbPath, v1user, logger);
      logger.info('Migrated ' + resMigrate.count + ' records for ' + userId);
      await v1user.close();
      counts.done++;
    } catch (err) {
      logger.error('ERROR during Migration V0 to V1: ' + err.message + ' >> For User: ' + userId + '>>> Check Dbs in: ' + userDir);
      logger.error(err);
      await unlinkFilePromise(v1dbPath);
      process.exit(1);
    }
  }
}



module.exports = {
  migrate0to1,
  checkAllUsers,
};
