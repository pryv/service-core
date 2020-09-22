/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var errors = require('components/errors').factory,
  commonFns = require('./helpers/commonFunctions'),
  mailing = require('./helpers/mailing'),
  encryption = require('components/utils').encryption,
  methodsSchema = require('../schema/accountMethods');

const { getConfig } = require('components/api-server/config/Config');

const Registration = require('components/business/src/auth/registration'),
  ErrorMessages = require('components/errors/src/ErrorMessages'),
  ErrorIds = require('components/errors').ErrorIds,
  ServiceRegister = require('components/business/src/auth/service_register'),
  UserRepository = require('components/business/src/users/repository');
  User = require('components/business/src/users/User'),
  SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
  /**
 * @param api
 * @param usersStorage
 * @param passwordResetRequestsStorage
 * @param authSettings
 * @param servicesSettings Must contain `email` and `register`
 * @param notifications
 */
module.exports = function (api, userEventsStorage, passwordResetRequestsStorage,
  authSettings, servicesSettings, notifications, logging) {

  var emailSettings = servicesSettings.email,
    requireTrustedAppFn = commonFns.getTrustedAppCheck(authSettings);

  // initialize service-register connection
  const serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));
  const userRepository = new UserRepository(userEventsStorage);

  // RETRIEVAL

  api.register('account.get',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.get.params),
    async function (context, params, result, next) {
      try {
        const user: User = await userRepository.getById(context.user.id);
        result.account = user.getAccount();
        next();
      } catch (err) {
        return next(errors.unexpectedError(err));
      }
    });

  // UPDATE

  api.register('account.update',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.update.params),
    validateThatAllFieldsAreEditable,
    notifyServiceRegister,
    updateAccount,
    buildResultData,
  );

  /**
   * Validate if given parameters are allowed for the edit
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  function validateThatAllFieldsAreEditable (context, params, result, next) {
    const nonEditableAccountStreamsIds = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForEditing();
    Object.keys(params.update).forEach(streamId => {
      const streamIdWithDot = SystemStreamsSerializer.addDotFromStreamId(streamId);
      if (nonEditableAccountStreamsIds.includes(streamIdWithDot)) {
        // if user tries to add new streamId from non editable streamsIds
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenToEditNoneditableAccountFields],
          { field: streamId }
        ));
      }
    })
    next();
  }
  // CHANGE PASSWORD

  api.register('account.changePassword',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.changePassword.params),
    verifyOldPassword,
    encryptNewPassword,
    updateAccount);

  async function verifyOldPassword (context, params, result, next) {
    try{
      const isValid = await userRepository.checkUserPassword(context.user.id, params.oldPassword);
      if (!isValid) {
        return next(errors.invalidOperation(
          'The given password does not match.'));
      }
      next();
    } catch (err) {
      // handles unexpected errors
      return next(err);
    }
  }

  // REQUEST PASSWORD RESET

  api.register('account.requestPasswordReset',
    commonFns.getParamsValidation(methodsSchema.requestPasswordReset.params),
    requireTrustedAppFn,
    generatePasswordResetRequest,
    sendPasswordResetMail);

  function generatePasswordResetRequest(context, params, result, next) {
    const username = context.user.username;
    if (username == null) {
      return next(new Error('AF: username is not empty.'));
    }
    passwordResetRequestsStorage.generate(username, function (err, token) {
      if (err) { return next(errors.unexpectedError(err)); }

      context.resetToken = token;
      next();
    });
  }

  function sendPasswordResetMail(context, params, result, next) {
    // Skip this step if reset mail is deactivated
    const isMailActivated = emailSettings.enabled;
    if (isMailActivated === false ||
       (isMailActivated != null && isMailActivated.resetPassword === false)) {
      return next();
    }

    const recipient = {
      email: context.user.email,
      name: context.user.username,
      type: 'to'
    };

    const substitutions = {
      RESET_TOKEN: context.resetToken,
      RESET_URL: authSettings.passwordResetPageURL
    };

    mailing.sendmail(emailSettings, emailSettings.resetPasswordTemplate,
      recipient, substitutions, context.user.language, next);
  }

  // RESET PASSWORD

  api.register('account.resetPassword',
    commonFns.getParamsValidation(methodsSchema.resetPassword.params),
    requireTrustedAppFn,
    checkResetToken,
    encryptNewPassword,
    updateAccount);

  function checkResetToken(context, params, result, next) {
    const username = context.user.username;
    if (username == null) {
      return next(new Error('AF: username is not empty.'));
    }
    passwordResetRequestsStorage.get(
      params.resetToken,
      username,
      function (err, reqData) {
        if (err) { return next(errors.unexpectedError(err)); }

        if (! reqData) {
          return next(errors.invalidAccessToken('The reset token is invalid or expired'));
        }
        next();
      }
    );
  }

  function encryptNewPassword(context, params, result, next) {
    if (! params.newPassword) { return next(); }

    encryption.hash(params.newPassword, function (err, hash) {
      if (err) { return next(errors.unexpectedError(err)); }

      params.update = { passwordHash: hash };
      next();
    });
  }

  async function notifyServiceRegister (context, params, result, next) {
    // no need to update service register if it is single node setup
    if (getConfig().get('singleNode:isActive') === true) {
      return next();
    }
    try {
      const serviceRegisterRequest = await context.user.getUpdateRequestToServiceRegister(
        params.update,
        true
      );
      await serviceRegisterConn.updateUserInServiceRegister(
        context.user.username,
        serviceRegisterRequest,
        {}
      );
    } catch (err) {
      next(error);
    }
    next();
  }

  async function updateAccount(context, params, result, next) {
    try {
      //const updateEventList = context.user.getEventsForUpdate(params.update);
      await userRepository.updateOne(context.user.id, params.update);
      notifications.accountChanged(context.user);
    } catch (err) {
      return next(Registration.handleUniquenessErrors(
        err,
        ErrorMessages[ErrorIds.UnexpectedErrorWhileSavingAccount],
        params.update
      ));
    }
    next();
  }

  /**
   * Build response body for the account update
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function buildResultData (context, params, result, next) {
    const user: User = await userRepository.getById(context.user.id);
    result.account = user.getAccount();
    next();
  }
};
