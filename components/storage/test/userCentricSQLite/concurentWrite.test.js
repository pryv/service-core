/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const userCentricSQLite = require('../../src/userCentricSQLite');
const { assert } = require('chai');
const cuid = require('cuid');

describe('[UCSQ] userCentricSQLite Storage concurent Writes', () => {
  let userStorage;

  before(async () => {
    const sqliteStorageManager = await userCentricSQLite.getStorage('test');
    userStorage = await sqliteStorageManager.forUser(cuid());
  });

  it('[69AH] should retry when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement () {
      callCount++;
      if (callCount > 20) return true;
      // eslint-disable-next-line no-throw-literal
      throw { code: 'SQLITE_BUSY' };
    }
    await userStorage.concurentSafeWriteStatement(statement, 21);
    assert.equal(callCount, 21);
  });

  it('[9H7P] should fail when max retries is reached when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement () {
      callCount++;
      if (callCount > 20) return true;
      // eslint-disable-next-line no-throw-literal
      throw { code: 'SQLITE_BUSY' };
    }
    try {
      await userStorage.concurentSafeWriteStatement(statement, 5);
      assert.isTrue(false, 'should not be reached');
    } catch (err) {
      assert.equal(err.message, 'Failed write action on Audit after 5 retries');
    }
  });
});
