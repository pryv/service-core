/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var errors = require('errors').factory,
  commonFns = require('./helpers/commonFunctions'),
  mailing = require('./helpers/mailing'),
  methodsSchema = require('../schema/accountMethods');

const { getConfig } = require('@pryv/boiler');

const { setAuditAccessId, AuditAccessIds } = require('audit/src/MethodContextUtils');

const Registration = require('business/src/auth/registration'),
  ErrorMessages = require('errors/src/ErrorMessages'),
  ErrorIds = require('errors').ErrorIds,
  { getServiceRegisterConn } = require('business/src/auth/service_register'),
  UsersRepository = require('business/src/users/repository');
  User = require('business/src/users/User'),
  SystemStreamsSerializer = require('business/src/system-streams/serializer');
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
  const serviceRegisterConn = getServiceRegisterConn();
  const usersRepository = new UsersRepository(userEventsStorage);

  // RETRIEVAL

  api.register('account.get',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.get.params),
    async function (context, params, result, next) {
      try {
        result.account = context.user.getLegacyAccount();
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
      const streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamId);
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
    addNewPasswordParameter,
    updateAccount
  );

  async function verifyOldPassword (context, params, result, next) {
    try{
      const isValid = await usersRepository.checkUserPassword(context.user.id, params.oldPassword);
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
    sendPasswordResetMail,
    setAuditAccessId(AuditAccessIds.PASSWORD_RESET_REQUEST));

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
    addNewPasswordParameter,
    updateAccount,
    setAuditAccessId(AuditAccessIds.PASSWORD_RESET_TOKEN)
  );

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

  function addNewPasswordParameter (context, params, result, next) {
    if (!context.user.passwordHash) {
      return next(errors.unexpectedError());
    }
    params.update = { password: params.newPassword };
    next();
  }

  async function notifyServiceRegister (context, params, result, next) {
    // no need to update service register if it is single node setup
    if ((await getConfig()).get('dnsLess:isActive') === true) {
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
        {},
        params.update
      );
    } catch (err) {
      return next(err);
    }
    next();
  }

  async function updateAccount(context, params, result, next) {
    try {
      const accessId = (context.access?.id) ? context.access.id : UsersRepository.options.SYSTEM_USER_ACCESS_ID
      await usersRepository.updateOne(
        context.user,
        params.update,
        accessId,
      );
      notifications.accountChanged(context.user);
    } catch (err) {
      return next(Registration.handleUniquenessErrors(
        err,
        ErrorMessages[ErrorIds.UnexpectedError],
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
    Object.keys(params.update).forEach(key => {
      context.user[key] = params.update[key];
    });
    result.account = context.user.getLegacyAccount();
    next();
  }
};
