/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const WAIT_LIST_MS = [1, 2, 5, 10, 15, 20, 25, 25, 25, 50, 50, 100];
const logger = require('@pryv/boiler').getLogger('sqliteConcurentWrites');

module.exports = {
  concurentSafeWriteStatement,
  initWALLAndConcurentSafeWriteCapabilities
};

/**
 * Init a DB in WAL and unsafe mode as we will take care of managing concurent writes errors.
 */
async function initWALLAndConcurentSafeWriteCapabilities (db) {
  await concurentSafeWriteStatement(() => {
    db.pragma('journal_mode = WAL');
  });
  await concurentSafeWriteStatement(() => {
    db.pragma('busy_timeout = 0'); // We take care of busy timeout ourselves as long as current driver does not go below the second
  });
  await concurentSafeWriteStatement(() => {
    db.unsafeMode(true);
  });
}

/**
 * Will look "retries" times, in case of "SQLITE_BUSY".
 * This is CPU intensive, but tests have shown this solution to be efficient
 */
async function concurentSafeWriteStatement (statement, retries = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      statement();
      return;
    } catch (error) {
      if (error.code !== 'SQLITE_BUSY') { // ignore
        throw error;
      }
      const waitTime = i > (WAIT_LIST_MS.length - 1) ? 100 : WAIT_LIST_MS[i];
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      logger.debug('SQLITE_BUSY, retrying in ' + waitTime + 'ms');
    }
  }
  throw new Error('Failed write action on SQLITE after ' + retries + ' retries');
}
