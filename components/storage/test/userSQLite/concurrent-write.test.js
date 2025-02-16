/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const concurrentSafeWrite = require('../../src/sqliteUtils/concurrentSafeWrite');
const { assert } = require('chai');

describe('[UCSQ] userSQLite Storage concurent Writes', () => {
  before(async () => {
  });

  it('[69AH] should retry when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement () {
      callCount++;
      if (callCount > 20) return true;
      throw mockBusyError();
    }
    await concurrentSafeWrite.execute(statement, 21);
    assert.equal(callCount, 21);
  });

  it('[9H7P] should fail when max retries is reached when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement () {
      callCount++;
      if (callCount > 20) return true;
      throw mockBusyError();
    }
    try {
      await concurrentSafeWrite.execute(statement, 5);
      assert.isTrue(false, 'should not be reached');
    } catch (err) {
      assert.equal(err.message, 'Failed write action on SQLite after 5 retries');
    }
  });
});

function mockBusyError () {
  return Object.assign(new Error(), { code: 'SQLITE_BUSY' });
}
