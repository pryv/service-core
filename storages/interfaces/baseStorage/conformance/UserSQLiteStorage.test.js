/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * UserSQLiteStorage + UserSQLiteDatabase conformance test suite.
 * Tests the LRU-cached Storage manager and the per-user Database contract.
 *
 * @param {Function} getStorage - async function returning an initialized Storage instance
 * @param {Function} getUserId - function returning a unique userId for test isolation
 * @param {Function} cleanupFn - async function called after tests for cleanup (receives userId)
 */
module.exports = function conformanceTests (getStorage, getUserId, cleanupFn) {
  const assert = require('node:assert');
  const { validateUserSQLiteStorage } = require('../UserSQLiteStorage');
  const { validateUserSQLiteDatabase } = require('../UserSQLiteDatabase');

  describe('UserSQLiteStorage conformance', () => {
    let storage;
    let userId;
    let userDb;

    before(async () => {
      storage = await getStorage();
      userId = getUserId();
      userDb = await storage.forUser(userId);
    });

    after(async () => {
      if (cleanupFn) await cleanupFn(userId);
    });

    it('[SQ01] must pass validateUserSQLiteStorage', () => {
      validateUserSQLiteStorage(storage);
    });

    it('[SQ02] getVersion() must return a version string', () => {
      const version = storage.getVersion();
      assert.ok(typeof version === 'string');
      assert.ok(version.length > 0);
    });

    it('[SQ03] forUser() must return a UserDatabase instance', async () => {
      assert.ok(userDb);
      assert.strictEqual(typeof userDb.getEvents, 'function');
    });

    it('[SQ04] forUser() must return the same cached instance', async () => {
      const userDb2 = await storage.forUser(userId);
      assert.strictEqual(userDb, userDb2);
    });

    describe('UserSQLiteDatabase conformance', () => {
      it('[SQ05] must pass validateUserSQLiteDatabase', () => {
        validateUserSQLiteDatabase(userDb);
      });

      it('[SQ06] countEvents() must return 0 initially', () => {
        const count = userDb.countEvents();
        assert.strictEqual(count, 0);
      });

      const testEvent = {
        id: 'sq-test-event-1',
        streamIds: ['sq-stream-1'],
        type: 'test/test',
        time: 1000,
        created: 1000,
        createdBy: 'test',
        modified: 1000,
        modifiedBy: 'test'
      };

      it('[SQ07] createEvent() must insert an event', async () => {
        await userDb.createEvent(testEvent);
        const count = userDb.countEvents();
        assert.strictEqual(count, 1);
      });

      it('[SQ08] getOneEvent() must return the inserted event', () => {
        const event = userDb.getOneEvent('sq-test-event-1');
        assert.ok(event);
        assert.strictEqual(event.id, 'sq-test-event-1');
        assert.strictEqual(event.type, 'test/test');
      });

      it('[SQ09] getEvents() must return matching events', () => {
        const events = userDb.getEvents({
          query: [
            { type: 'equal', content: { field: 'type', value: 'test/test' } }
          ]
        });
        assert.ok(Array.isArray(events));
        assert.ok(events.length >= 1);
      });

      it('[SQ10] updateEvent() must update the event', async () => {
        const updated = await userDb.updateEvent('sq-test-event-1', {
          type: 'test/updated',
          modified: 2000,
          modifiedBy: 'test-update'
        });
        assert.ok(updated);
        const event = userDb.getOneEvent('sq-test-event-1');
        assert.strictEqual(event.type, 'test/updated');
      });

      it('[SQ11] getAllActions() must return an array', () => {
        const actions = userDb.getAllActions();
        assert.ok(Array.isArray(actions));
      });

      it('[SQ12] getAllAccesses() must return an array', () => {
        const accesses = userDb.getAllAccesses();
        assert.ok(Array.isArray(accesses));
      });

      describe('migration methods', () => {
        it('[SQ13] exportAllEvents() must return all raw rows', () => {
          const rows = userDb.exportAllEvents();
          assert.ok(Array.isArray(rows));
          assert.ok(rows.length >= 1);
          // Raw rows use 'eventid' not 'id'
          assert.ok(rows[0].eventid != null);
        });

        it('[SQ14] importAllEvents() must insert raw rows', async () => {
          const rows = userDb.exportAllEvents();
          // Modify eventid to avoid UNIQUE constraint
          const importRow = Object.assign({}, rows[0], { eventid: 'sq-imported-1' });
          await userDb.importAllEvents([importRow]);
          const count = userDb.countEvents();
          assert.ok(count >= 2);
        });

        it('[SQ15] importAllEvents() with empty array must be a no-op', async () => {
          const countBefore = userDb.countEvents();
          await userDb.importAllEvents([]);
          const countAfter = userDb.countEvents();
          assert.strictEqual(countAfter, countBefore);
        });
      });

      it('[SQ16] deleteUser() must remove the user database', async () => {
        const deleteUserId = getUserId() + '-del';
        const delDb = await storage.forUser(deleteUserId);
        await delDb.createEvent({
          id: 'sq-del-event',
          streamIds: ['sq-stream'],
          type: 'test/test',
          time: 1000,
          created: 1000,
          createdBy: 'test',
          modified: 1000,
          modifiedBy: 'test'
        });
        await storage.deleteUser(deleteUserId);
        // After deletion, forUser should return a fresh empty database
        const freshDb = await storage.forUser(deleteUserId);
        assert.strictEqual(freshDb.countEvents(), 0);
        await storage.deleteUser(deleteUserId);
      });
    });
  });
};
