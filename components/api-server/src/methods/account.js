var errors = require('components/errors').factory,
    commonFns = require('./helpers/commonFunctions'),
    mailing = require('./helpers/mailing'),
    encryption = require('components/utils').encryption,
    methodsSchema = require('../schema/accountMethods'),
    request = require('superagent'),
    util = require('util');

/**
 * @param api
 * @param usersStorage
 * @param passwordResetRequestsStorage
 * @param authSettings
 * @param servicesSettings Must contain `email` and `register`
 * @param notifications
 */
module.exports = function (api, usersStorage, passwordResetRequestsStorage,
  authSettings, servicesSettings, notifications, storageLayer) {

  var registerSettings = servicesSettings.register,
      emailSettings = servicesSettings.email,
      requireTrustedAppFn =  commonFns.getTrustedAppCheck(authSettings);

  // RETRIEVAL

  api.register('account.get',
    commonFns.loadAccess(storageLayer),
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.get.params),
    function (context, params, result, next) {
      usersStorage.findOne({id: context.user.id}, null, function (err, user) {
        if (err) { return next(errors.unexpectedError(err)); }

        sanitizeAccountDetails(user);
        result.account = user;
        next();
      });
    });

  // UPDATE

  api.register('account.update',
    commonFns.loadAccess(storageLayer),
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.update.params),
    updateAccount,
    notifyEmailChangeToRegister);

  // CHANGE PASSWORD

  api.register('account.changePassword',
    commonFns.loadAccess(storageLayer),
    commonFns.requirePersonalAccess,
    commonFns.getParamsValidation(methodsSchema.changePassword.params),
    verifyOldPassword,
    encryptNewPassword,
    updateAccount,
    cleanupResult);

  function verifyOldPassword(context, params, result, next) {
    encryption.compare(params.oldPassword, context.user.passwordHash, function (err, isValid) {
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
    var requestData = {};
    passwordResetRequestsStorage.generate(requestData, function (err, token) {
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
      recipient, substitutions, context.user.language, (err, res) => {
        // Check if first argument is Error;
        if (err instanceof Error || (res && ! res.ok)) {
          if (! err) { err = new Error(util.inspect(res.body)); }
          return next(errors.unexpectedError(err, 'Could not reach e-mail service.'));
        }
        
        next();
      });
  }

  // RESET PASSWORD

  api.register('account.resetPassword',
    commonFns.getParamsValidation(methodsSchema.resetPassword.params),
    requireTrustedAppFn,
    checkResetToken,
    encryptNewPassword,
    updateAccount,
    cleanupResult);

  function checkResetToken(context, params, result, next) {
    passwordResetRequestsStorage.get(params.resetToken, function (err, reqData) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! reqData) {
        return next(errors.invalidAccessToken('The reset token is invalid or expired'));
      }
      next();
    });
  }

  function encryptNewPassword(context, params, result, next) {
    if (! params.newPassword) { return next(); }

    encryption.hash(params.newPassword, function (err, hash) {
      if (err) { return next(errors.unexpectedError(err)); }

      params.update = {passwordHash: hash};
      next();
    });
  }

  function updateAccount(context, params, result, next) {
    usersStorage.updateOne({id: context.user.id}, params.update, function (err, updatedUser) {
      if (err) { return next(errors.unexpectedError(err)); }

      sanitizeAccountDetails(updatedUser);
      result.account = updatedUser;
      notifications.accountChanged(context.user);
      next();
    });
  }

  function notifyEmailChangeToRegister(context, params, result, next) {
    if (! params.update.email || params.update.email === context.user.email) {
      return next();
    }
    // email was changed, must notify registration server
    var regChangeEmailURL = registerSettings.url + '/users/' + context.user.username +
        '/change-email';
    request.post(regChangeEmailURL)
      .set('Authorization', registerSettings.key)
      .send({email: params.update.email})
      .end(function (err, res) {
      // check if first argument is Error;
      // for some reason superagent did return res as first argument on success
        if (err instanceof Error || (res && ! res.ok)) {
          if (! err) { err = new Error(util.inspect(res.body)); }
          return next(errors.unexpectedError(err, 'Could not reach register service.'));
        }

        next();
      });
  }

  function cleanupResult(context, params, result, next) {
    delete result.account;
    next();
  }

  function sanitizeAccountDetails(data) {
    delete data.id;
    delete data.passwordHash;
    if (! data.storageUsed) {
      data.storageUsed = {
        dbDocuments: -1,
        attachedFiles: -1
      };
    }
  }

};
module.exports.injectDependencies = true;
