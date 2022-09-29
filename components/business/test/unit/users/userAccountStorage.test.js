/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, it, before, after */

const assert = require('chai').assert;
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const userAccountStorage = require('business/src/users/userAccountStorage');

describe('[UAST] Users Account Storage', () => {
  const passwords = []; // password will be stored in reverse order (oldest first)
  const userId = cuid();

  before(async () => {
    await userAccountStorage.init();
    // create five passwords with one day delay between each other
    const now = timestamp.now();
    for (let i = 4; i >= 0; i--) { // in descending order
      const createdPassword = await userAccountStorage.addPassword(userId, `hash_${i}`, 'test', timestamp.add(now, `-${i}d`));
      assert.exists(createdPassword.passwordId);
      assert.exists(createdPassword.time);
      passwords.push(createdPassword);
    }
  });

  after(async () => {

  });

  describe('passwordExistsInHistory()', () => {
    it('[1OQP] must return true when looking for existing passwords', async () => {
      for (const password of passwords) {
        const passwordExists = await userAccountStorage.passwordExistsInHistory(userId, password.hash, passwords.length);
        assert.isTrue(passwordExists, 'should find password ' + JSON.stringify(password));
      }
    });

    it('[DO33] must return false when looking for a non-existing password', async () => {
      const passwordExists = await userAccountStorage.passwordExistsInHistory(userId, 'unknown_hash', passwords.length);
      assert.isFalse(passwordExists, 'should not find password with non-existing hash');
    });

    it('[FEYP] must return false when looking for an existing password that is beyond the given range', async () => {
      const oldestPassword = passwords[0];
      const passwordExists = await userAccountStorage.passwordExistsInHistory(userId, oldestPassword.hash, passwords.length - 1);
      assert.isFalse(passwordExists, 'should not find password beyond the given range: ' + JSON.stringify(oldestPassword));
    });
  });

  describe('Password history time uniqueness', () => {
    it('[B2I7] must throw an error if 2 password are created with the same date', async () => {
      const userId2 = cuid();
      const now = timestamp.now();
      await userAccountStorage.addPassword(userId2, 'hash_1', 'test', now);
      try {
        await userAccountStorage.addPassword(userId2, 'hash_2', 'test', now);
      } catch (e) {
        assert.equal(e.message, 'UNIQUE constraint failed: passwords.time');
        return;
      }
      assert.isFalse(true, 'should throw an error');
    });
  });
});
