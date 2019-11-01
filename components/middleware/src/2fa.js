// @flow

const speakeasy = require('speakeasy');
const otplib = require('otplib');
const errors = require('components/errors').factory;

// 2FA middleware
// 
module.exports = function twoFA() {
  return async function (
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    const user = req.context.user;
    const twofaCode = req.query.twofaCode;

    if (user != null && user.twofa != null) {
      if (twofaCode == null) {
        return next(errors.forbidden('Missing 2FA code.'));
      }
      //const verified = speakeasy.totp.verify({secret: user.twofa, encoding: 'base32', token: twofaCode});
      const verified = otplib.authenticator.check(twofaCode, user.twofa);
      if (!verified) {
        return next(errors.forbidden('2FA invalid, please try again.'));
      }
    }
    next();
  };
};
