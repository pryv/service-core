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
    methodsSchema = require('../schema/accountMethods'),
    request = require('superagent'),
    bluebird = require('bluebird');
/**
 * @param api
 * @param usersStorage
 * @param passwordResetRequestsStorage
 * @param authSettings
 * @param servicesSettings Must contain `email` and `register`
 * @param notifications
 */
module.exports = function (api, userEventsStorage, passwordResetRequestsStorage,
  authSettings, servicesSettings, notifications) {

  var registerSettings = servicesSettings.register,
    emailSettings = servicesSettings.email,
    requireTrustedAppFn = commonFns.getTrustedAppCheck(authSettings);

  // RETRIEVAL

  api.register('account.get',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.get.params),
    async function (context, params, result, next) {
      try {
        result.account = await userEventsStorage.getUserInfo({
          user: { id: context.user.id },
          getAll: false
        });

        next();
      } catch (err) {
        return next(errors.unexpectedError(err));
      }
    });

  // UPDATE

  api.register('account.update',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.update.params),
    notifyEmailChangeToRegister,
    updateAccount);

  // CHANGE PASSWORD

  api.register('account.changePassword',
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.changePassword.params),
    verifyOldPassword,
    encryptNewPassword,
    updateAccount);

  async function verifyOldPassword (context, params, result, next) {
    const userPass = await userEventsStorage.getUserPasswordHash(context.user.id);

    if (userPass == null)
      throw errors.unknownResource('user', context.user.username);

    encryption.compare(params.oldPassword, userPass, function (err, isValid) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! isValid) {
        return next(errors.invalidOperation(
          'The given password does not match.'));
      }
      next();
    });
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

  function notifyEmailChangeToRegister(context, params, result, next) {
    const currentEmail = context.user.email;
    const newEmail = params.update.email;

    if (newEmail == null || newEmail === currentEmail) {
      return next();
    }
    // email was changed, must notify registration server
    const regChangeEmailURL = registerSettings.url + '/users/' + context.user.username +
        '/change-email';
    request.post(regChangeEmailURL)
      .set('Authorization', registerSettings.key)
      .send({ email: newEmail })
      .end(function (err, res) {

        if (err != null || (res && ! res.ok)) {
          let errMsg = 'Failed to update email on register. ';
          // for some reason register returns error message within res.body
          if (res != null && res.body != null && res.body.message != null) {
            errMsg += res.body.message;
          } else if (err != null && err.message != null) {
            errMsg += err.message;
          }
          return next(errors.invalidOperation(errMsg, { email: newEmail }, err));
        }

        next();
      });
  }

  async function updateAccount(context, params, result, next) {
    try {
      // form tasks to update the events
      const fieldsToUpdate = Object.keys(params.update);
      Object.keys(params.update).map(paramKey => {
        return bluebird.fromCallback(cb => userEventsStorage.updateOne(
          { id: context.user.id },
          { streamIds: paramKey },
          { content: params.update[paramKey] }, cb));
      });

      // retrieve and form user info
    /* TODO IEVA  is this exception is really necessary ?*/
      if (!fieldsToUpdate.includes('passwordHash')){
        result.account = await userEventsStorage.getUserInfo({
          user: { id: context.user.id },
          getAll: false
        });
      }

      notifications.accountChanged(context.user);
      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }
};
