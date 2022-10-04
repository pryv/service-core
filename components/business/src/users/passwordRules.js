/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
let singleton = null;

/**
 * Return the password rules singleton, initializing it with the given settings if needed.
 */
module.exports = function get (authSettings) {
  if (!singleton) {
    singleton = init(authSettings);
  }
  return singleton;
};

function init (authSettings) {
  const settings = authSettings;
  const charCategoriesRegExps = {
    lowercase: /[a-z]/,
    uppercase: /[A-Z]/,
    numberRegEx: /[0-9]/,
    specialChar: /[^a-zA-Z0-9]/
  };

  return {
    /**
     * @param {String} password
     * @throws {Error} If the password does not follow the configured rules
     */
    checkNewPassword (password) {
      checkLength(password);
      checkCharCategories(password);
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
}
