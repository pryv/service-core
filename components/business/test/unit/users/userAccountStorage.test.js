/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const assert = require('chai').assert;
const cuid = require('cuid');

const userAccountStorage = require('business/src/users/userAccountStorage');

describe('[UAST] Users Account Storage', () => {
  const passwords = []; // password will be stored in reverse order (oldest first)
  const userId = cuid();

  before(async function () {
    await userAccountStorage.init();
    // create five passwords with one day delay between each other
    const now = Date.now() / 1000;
    for (let i = 4; i >= 0; i--) { // in descending order
      const createdPassword = await userAccountStorage.passwordSetHash(userId, 'hash' + i, 'createdByTest', now - 3600 * 24 * i);
      assert.exists(createdPassword.passwordId);
      assert.exists(createdPassword.time);
      passwords.push(createdPassword);
    }
  });

  after(async () => {

  });

  it('[1OQP] must find created password hashesin history', async () => {
    // they should be found
    for (const password of passwords) {
      const passwordExists = await userAccountStorage.passwordHashExistsInHistory(userId, password.hash, passwords.length);
      assert.isTrue(passwordExists, 'should find password ' + JSON.stringify(password));
    }
  });

  it('[FEYP] must not find oldest password hash in history if not covered by nLast', async () => {
    // take oldest password
    const oldestPassword = passwords[0];
    const passwordExists = await userAccountStorage.passwordHashExistsInHistory(userId, oldestPassword.hash, passwords.length - 1);
    assert.isFalse(passwordExists, 'should not find oldest password' + JSON.stringify(oldestPassword));
  });

  it('[DO33] must not find inexisisting password hash in history ', async () => {
    // take oldest password
    const passwordExists = await userAccountStorage.passwordHashExistsInHistory(userId, 'bob', passwords.length);
    assert.isFalse(passwordExists, 'should not find password with inexistant hash');
  });

  it('[Q7BV] must find existing password hashes in history since oldest passowrd hash', async () => {
    for (const password of passwords) {
      const passwordExists = await userAccountStorage.passwordHashExistsInHistorySince(userId, password.hash, passwords[0].time - 1);
      assert.isTrue(passwordExists, 'should find password ' + JSON.stringify(password));
    }
  });

  it('[7RB9] must not find existing password hashes in history if not covered by timeframe', async () => {
    for (const password of passwords) {
      const passwordExists = await userAccountStorage.passwordHashExistsInHistorySince(userId, password.hash, password.time + 1);
      assert.isFalse(passwordExists, 'should not find password ' + JSON.stringify(password) + ' with time > ' + (password.time + 1));
    }
  });

});
