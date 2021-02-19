/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, cuid, audit, config, initTests, closeTests */

describe('Storage', () => {
  let userid = cuid();
  let createdBy = cuid();

  before(async () => {
    await initTests();
  });

  after(() => {
    closeTests();
  });

  describe('receive message and write it into its own database', () => {

    async function sendAndWait(event) {
      const e = Object.assign(
        {
          type: 'log/test',
          createdBy: createdBy,
          streamIds: ['.audit-test'],
          content: {
            message: 'hello'
          }
        }, event);
      return await audit.eventForUser(userid, e);
    }
    
    it('[KA8B] should have written the action in the user\'s database', async () => {
      const event = {content: cuid() }
      await sendAndWait(event);

      const userStrorage = audit.storage.forUser(userid);
      const entries = userStrorage.getLogs({createdBy: createdBy});
      assert.equal(entries.length, 1);
      assert.equal(entries[0].createdBy, createdBy);
      assert.equal(entries[0].content, event.content);
    });
  })
});