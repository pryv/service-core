/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { concurentSafeWriteStatement } = require('../../src/sqliteUtils/concurentSafeWriteStatement');
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
      // eslint-disable-next-line no-throw-literal
      throw { code: 'SQLITE_BUSY' };
    }
    await concurentSafeWriteStatement(statement, 21);
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
      await concurentSafeWriteStatement(statement, 5);
      assert.isTrue(false, 'should not be reached');
    } catch (err) {
      assert.equal(err.message, 'Failed write action on SQLITE after 5 retries');
    }
  });
});
