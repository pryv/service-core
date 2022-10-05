/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const userAccountStorage = require('./userAccountStorage');

let singleton = null;

/**
 * Return the password rules singleton, initializing it with the given settings if needed.
 */
module.exports = async function get (authSettings) {
  if (!singleton) {
    singleton = init(authSettings);
  }
  return singleton;
};

async function init (authSettings) {
  await userAccountStorage.init();
  const settings = authSettings;
  const charCategoriesRegExps = {
    lowercase: /[a-z]/,
    uppercase: /[A-Z]/,
    numberRegEx: /[0-9]/,
    specialChar: /[^a-zA-Z0-9]/
  };

  return {
    /**
     * @param {String} userId
     * @param {String} password
     * @throws {Error} If the password does not follow the configured rules
     */
    async checkNewPassword (userId, password) {
      checkLength(password);
      checkCharCategories(password);
      await checkHistory(userId, password);
    }
  };

  function checkLength (password) {
    const minLength = settings.passwordComplexityMinLength;
    if (minLength === 0) {
      return;
    }
    const length = password.length;
    if (length <= minLength) {
      throw new Error(`Password is ${length} characters long, but at least ${minLength} are required`);
    }
  }

  function checkCharCategories (password) {
    const requiredCharCats = settings.passwordComplexityMinCharCategories;
    if (requiredCharCats === 0) {
      return;
    }
    const count = countCharCategories(password);
    if (count < requiredCharCats) {
      throw new Error(`Password contains characters from ${count} categories, but at least ${requiredCharCats} are required`);
    }
  }

  function countCharCategories (password) {
    return Object.values(charCategoriesRegExps).reduce(
      (count, regExp) => regExp.test(password) ? count + 1 : count,
      0
    );
  }

  async function checkHistory (userId, password) {
    const historyLength = settings.passwordPreventReuseHistoryLength;
    if (historyLength === 0) {
      return;
    }
    if (await userAccountStorage.passwordExistsInHistory(userId, password, settings.passwordPreventReuseHistoryLength)) {
      throw new Error(`Password was found in the ${settings.passwordPreventReuseHistoryLength} last used passwords, which is forbidden`);
    }
  }
}
