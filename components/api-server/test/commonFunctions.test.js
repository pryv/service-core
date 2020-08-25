/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, it */

const commonFns = require('../src/methods/helpers/commonFunctions');
const errors = require('components/errors').factory;
const ErrorIds = require('components/errors').ErrorIds;
const ErrorMessages = require('components/errors/src/ErrorMessages');
const chai = require('chai');
const assert = chai.assert;

describe('methods/helpers/commonFunctions.js', function () {
  describe('apiErrorToValidationErrorsList()', function () {
    it('[ZQ0C] Should correctly form validation errors', () => {
      let errorsList = [];
      errorsList.push(errors.ReservedUsername());
      errorsList.push(errors.existingField('username'));
      const formedErrors = commonFns.apiErrorToValidationErrorsList(errorsList);

      assert.equal(formedErrors.id, ErrorIds.InvalidParametersFormat);
      assert.equal(formedErrors.message, "The parameters' format is invalid.");
      assert.equal(formedErrors.httpStatus, 400);
      assert.equal(formedErrors.innerError, null);
      assert.equal(formedErrors.dontNotifyAirbrake, true);
      assert.deepEqual(formedErrors.data, [
        {
          code: ErrorIds.ReservedUsername,
          message: ErrorMessages[ErrorIds.ReservedUsername],
          param: 'username',
          path: '#/username'
        },
        {
          code: ErrorIds.Existing_username,
          message: ErrorMessages[ErrorIds.Existing_username],
          param: 'username',
          path: '#/username'
        }
      ]);
    });
  });
});