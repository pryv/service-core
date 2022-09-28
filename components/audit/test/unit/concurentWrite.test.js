/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, cuid, audit, config, initTests, sinon*/

describe('Audit Storage concurent Writes', () => {
  let userId = cuid();
  let createdBy = cuid();
  let userStorage;

  before(async () => {
    await initTests();
  });

  async function sendAndWait(event) {
    const e = Object.assign(
      {
        type: 'log/test',
        createdBy: createdBy,
        streamIds: [':_audit:test'],
        content: {
          action: 'events.get',
          message: 'hello',
        }
      }, event);
    await audit.eventForUser(userId, e);
    return e;
  }

  before(async () => {
    userStorage = await audit.storage.forUser(userId);
  });

  it('[69AH] should retry when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement() {
      callCount++;
      if (callCount > 20) return true;
      throw {code: 'SQLITE_BUSY'};
    }
    await userStorage.concurentSafeWriteStatement(statement, 21);
    assert.equal(callCount, 21);
  });


  it('[9H7P] should fail when max retries is reached when SQLITE_BUSY', async () => {
    let callCount = 0;
    // function that throws at first call only
    function statement() {
      callCount++;
      if (callCount > 20) return true;
      throw {code: 'SQLITE_BUSY'};
    }
    try {
      await userStorage.concurentSafeWriteStatement(statement, 5);
      assert.isTrue(false, 'should not be reached');
    } catch (err) {
      assert.equal(err.message, 'Failed write action on Audit after 5 retries');
    }

  });

});
