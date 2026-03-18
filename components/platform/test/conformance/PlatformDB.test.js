/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * PlatformDB conformance test suite.
 * @param {Function} getDB - async function returning an initialized PlatformDB instance
 */
module.exports = function conformanceTests (getDB) {
  const assert = require('node:assert');
  const cuid = require('cuid');

  describe('PlatformDB conformance', () => {
    let db;

    before(async () => {
      db = await getDB();
    });

    afterEach(async () => {
      await db.deleteAll();
    });

    describe('setUserUniqueField() / getUsersUniqueField()', () => {
      it('must set and retrieve a unique field', async () => {
        const username = 'user-' + cuid();
        const email = 'test-' + cuid() + '@example.com';
        await db.setUserUniqueField(username, 'email', email);

        const result = await db.getUsersUniqueField('email', email);
        assert.strictEqual(result, username);
      });

      it('must return null for non-existing unique field', async () => {
        const result = await db.getUsersUniqueField('email', 'nonexist-' + cuid());
        assert.strictEqual(result, null);
      });
    });

    describe('setUserUniqueFieldIfNotExists()', () => {
      it('must set a new unique field and return true', async () => {
        const username = 'user-' + cuid();
        const email = 'ifne-' + cuid() + '@example.com';
        const result = await db.setUserUniqueFieldIfNotExists(username, 'email', email);
        assert.strictEqual(result, true);

        const stored = await db.getUsersUniqueField('email', email);
        assert.strictEqual(stored, username);
      });

      it('must return false when field already exists for different user', async () => {
        const user1 = 'user1-' + cuid();
        const user2 = 'user2-' + cuid();
        const email = 'dup-' + cuid() + '@example.com';

        await db.setUserUniqueFieldIfNotExists(user1, 'email', email);
        const result = await db.setUserUniqueFieldIfNotExists(user2, 'email', email);
        assert.strictEqual(result, false);

        // Original value unchanged
        const stored = await db.getUsersUniqueField('email', email);
        assert.strictEqual(stored, user1);
      });

      it('must return true when re-setting for the same user', async () => {
        const username = 'user-' + cuid();
        const email = 'same-' + cuid() + '@example.com';

        await db.setUserUniqueFieldIfNotExists(username, 'email', email);
        const result = await db.setUserUniqueFieldIfNotExists(username, 'email', email);
        assert.strictEqual(result, true);
      });
    });

    describe('setUserIndexedField() / getUserIndexedField()', () => {
      it('must set and retrieve an indexed field', async () => {
        const username = 'user-' + cuid();
        await db.setUserIndexedField(username, 'lang', 'en');

        const result = await db.getUserIndexedField(username, 'lang');
        assert.strictEqual(result, 'en');
      });

      it('must return null for non-existing indexed field', async () => {
        const result = await db.getUserIndexedField('nonexist-' + cuid(), 'lang');
        assert.strictEqual(result, null);
      });
    });

    describe('deleteUserUniqueField()', () => {
      it('must delete a unique field', async () => {
        const username = 'user-' + cuid();
        const email = 'del-' + cuid() + '@example.com';
        await db.setUserUniqueField(username, 'email', email);
        await db.deleteUserUniqueField('email', email);

        const result = await db.getUsersUniqueField('email', email);
        assert.strictEqual(result, null);
      });
    });

    describe('deleteUserIndexedField()', () => {
      it('must delete an indexed field', async () => {
        const username = 'user-' + cuid();
        await db.setUserIndexedField(username, 'lang', 'fr');
        await db.deleteUserIndexedField(username, 'lang');

        const result = await db.getUserIndexedField(username, 'lang');
        assert.strictEqual(result, null);
      });
    });

    describe('getAllWithPrefix()', () => {
      it('must return all entries', async () => {
        const u1 = 'user1-' + cuid();
        const u2 = 'user2-' + cuid();
        await db.setUserUniqueField(u1, 'email', u1 + '@test.com');
        await db.setUserIndexedField(u2, 'lang', 'de');

        const all = await db.getAllWithPrefix('user');
        assert.ok(Array.isArray(all));
        assert.ok(all.length >= 2);
      });
    });

    describe('deleteAll()', () => {
      it('must delete all entries', async () => {
        await db.setUserIndexedField('u-' + cuid(), 'lang', 'en');
        await db.deleteAll();

        const all = await db.getAllWithPrefix('user');
        assert.strictEqual(all.length, 0);
      });
    });

    describe('close() / isClosed()', () => {
      it('isClosed() must return false when open', () => {
        assert.strictEqual(db.isClosed(), false);
      });
    });

    describe('migration methods', () => {
      it('exportAll() must return data from getAllWithPrefix', async () => {
        const u = 'exp-' + cuid();
        await db.setUserIndexedField(u, 'lang', 'it');
        const exported = await db.exportAll();
        assert.ok(Array.isArray(exported));
        assert.ok(exported.length >= 1);
      });

      it('importAll() must import entries', async () => {
        const u = 'imp-' + cuid();
        const email = 'imp-' + cuid() + '@test.com';
        await db.importAll([
          { isUnique: true, username: u, field: 'email', value: email },
          { isUnique: false, username: u, field: 'lang', value: 'ja' }
        ]);

        const uniqueResult = await db.getUsersUniqueField('email', email);
        assert.strictEqual(uniqueResult, u);
        const indexedResult = await db.getUserIndexedField(u, 'lang');
        assert.strictEqual(indexedResult, 'ja');
      });

      it('clearAll() must remove all data', async () => {
        await db.setUserIndexedField('clr-' + cuid(), 'lang', 'pt');
        await db.clearAll();

        const all = await db.getAllWithPrefix('user');
        assert.strictEqual(all.length, 0);
      });
    });
  });
};
