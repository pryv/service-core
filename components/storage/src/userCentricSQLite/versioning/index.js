/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');
const fs = require('fs');

const userLocalDirectory = require('business').users.userLocalDirectory;

const UserDatabase = require('../UserDatabase');
const { migrate0to1 } = require('./migrate0to1');

module.exports = {
  migrate0to1,
  checkAllUsers
};

const { getLogger } = require('@pryv/boiler');
const logger = getLogger('sqlite-storage-migration');

async function checkAllUsers (storage) {
  const usersBaseDirectory = userLocalDirectory.getBasePath();

  const auditDBVersionFile = path.join(usersBaseDirectory, 'audit-db-version-' + storage.getVersion() + '.txt');
  if (fs.existsSync(auditDBVersionFile)) {
    logger.debug('Audit db version file found, skipping migration for ' + storage.getVersion());
    return;
  }
  const counts = { done: 0, skip: 0 };

  await foreachUserDirectory(checkUserDir, usersBaseDirectory, logger);
  logger.info('Done with migration for ' + storage.getVersion() + ': ' + counts.done + ' done, ' + counts.skip + ' skipped');

  await fs.writeFileSync(auditDBVersionFile, 'DO NOT DELETE THIS FILE - IT IS USED TO DETECT MIGRATION SUCESS');

  return counts;

  async function checkUserDir (userId, userDir) {
    // check if a migration from a non upgradeable schema (copy file to file) is needed
    const v0dbPath = path.join(userDir, 'audit.sqlite');

    if (!fs.existsSync(v0dbPath)) {
      logger.info('OK for ' + userId);
      counts.skip++;
      return; // skip as file exists
    }

    const v1dbPath = await storage.dbPathForUserId(userId);
    if (fs.existsSync(v1dbPath)) {
      logger.error('ERROR: Found V0 and V1 database for: ' + userId + '>>> Manually delete one of the version in: ' + userDir);
      process.exit(1);
    }

    const v1user = new UserDatabase(logger, { dbPath: v1dbPath });

    try {
      await v1user.init();
      const resMigrate = await migrate0to1(v0dbPath, v1user, logger);
      logger.info('Migrated ' + resMigrate.count + ' records for ' + userId);
      await v1user.close();
      counts.done++;
    } catch (err) {
      logger.error('ERROR during Migration V0 to V1: ' + err.message + ' >> For User: ' + userId + '>>> Check Dbs in: ' + userDir);
      logger.error(err);
      await fs.promises.unlink(v1dbPath);
      process.exit(1);
    }
  }
}

/**
 * @param {Function} asyncCallBack(uid, path)
 * @param {string} [userDataPath] -- Optional, user data path
 * @param {string} [logger] -- Optional, logger
 */
async function foreachUserDirectory (asyncCallBack, userDataPath, logger) {
  await loop(userDataPath, '');

  async function loop (loopPath, tail) {
    const fileNames = fs.readdirSync(loopPath);

    for (const fileName of fileNames) {
      if (tail.length < 3 && fileName.length !== 1) { logger.warn('Skipping no 1 char' + fileName); continue; }
      const myDirPath = path.join(loopPath, fileName);
      if (!fs.statSync(myDirPath).isDirectory()) { logger.warn('Skipping File' + fileName); continue; }
      const myTail = fileName + tail;

      if (tail.length < 3) {
        await loop(myDirPath, myTail);
      } else {
        if (!fileName.endsWith(tail)) { logger.warn('Skipping not valid userDir' + myDirPath); continue; }
        await asyncCallBack(fileName, myDirPath);
      }
    }
  }
}
