/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert, cuid, audit, config, initTests*/

describe('Audit Storage', () => {
  let userid = cuid();
  let createdBy = cuid();

  before(async () => {
    await initTests();
  });

  describe('receive message and write it into its own database', () => {
    let userStrorage;

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
      await audit.eventForUser(userid, e);
      return e;
    }

    before(async () => {
      userStrorage = await audit.storage.forUser(userid);
    });
    
    it('[KA8B] should have written the action in the user\'s database', async () => {
      const event = await sendAndWait({});
      const entries = userStrorage.getLogs({createdBy: createdBy});
      assert.equal(entries.length, 1);
      assert.equal(entries[0].createdBy, createdBy);
      assert.deepEqual(entries[0].content, event.content);
    });

    it('[9VM3]  storage.getActions returns a list of available actions', async () => { 
      const event1 = await sendAndWait({streamIds:['access-toto', 'action-events.get']});
      const event2 = await sendAndWait({streamIds:['access-titi', 'action-events.create']});
      const event3 = await sendAndWait({streamIds:['access-titi', 'action-events.get']});
      const actions = userStrorage.getAllActions();
      const accesses = userStrorage.getAllAccesses();
      assert.equal(actions.length, 2);
      assert.equal(accesses.length, 2);
    });
  });


  
});