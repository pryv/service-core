/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const timestamp = require('unix-timestamp');

const userAccountStorage = require('./userAccountStorage');
const errors = require('errors').factory;

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
     * TODO: merge with verification of current password once passwords are entirely within user account storage
     * @param {String} userId
     * @throws {APIError} If the password does not follow the configured rules
     */
    async checkCurrentPasswordAge (userId) {
      await checkMinimumAge(userId);
    },
    /**
     * @param {String} userId
     * @param {String} password
     * @throws {APIError} If the password does not follow the configured rules
     */
    async checkNewPassword (userId, password) {
      checkLength(password);
      checkCharCategories(password);
      await checkHistory(userId, password);
    }
  };

  async function checkMinimumAge (userId) {
    const minDays = settings.passwordAgeMinDays;
    if (minDays === 0) {
      return;
    }
    const pwdTime = await userAccountStorage.getCurrentPasswordTime(userId);
    if (timestamp.now(`-${minDays}d`) < pwdTime) {
      const msg = `The current password was set less than ${minDays} day(s) ago`;
      throw errors.invalidOperation(`The password cannot be changed yet (age rules): ${msg}`);
    }
  }

  function checkLength (password) {
    const minLength = settings.passwordComplexityMinLength;
    if (minLength === 0) {
      return;
    }
    const length = password.length;
    if (length <= minLength) {
      const msg = `Password is ${length} characters long, but at least ${minLength} are required`;
      throw errors.invalidParametersFormat(`The new password does not follow complexity rules: ${msg}`, [msg]);
    }
  }

  function checkCharCategories (password) {
    const requiredCharCats = settings.passwordComplexityMinCharCategories;
    if (requiredCharCats === 0) {
      return;
    }
    const count = countCharCategories(password);
    if (count < requiredCharCats) {
      const msg = `Password contains characters from ${count} categories, but at least ${requiredCharCats} are required`;
      throw errors.invalidParametersFormat(`The new password does not follow complexity rules: ${msg}`, [msg]);
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
      const msg = `Password was found in the ${settings.passwordPreventReuseHistoryLength} last used passwords, which is forbidden`;
      throw errors.invalidOperation(`The new password does not follow reuse rules: ${msg}`);
    }
  }
}
