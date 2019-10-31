// @flow

const speakeasy = require('speakeasy');
const errors = require('components/errors').factory;

//import type { StorageLayer } from 'components/storage';

const dbMock = {};

// 2FA middleware
// 
module.exports = function twoFA(/*storageLayer: StorageLayer*/) {
  return async function (
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    const username = req.context.username;
    // TODO: load secret from mongo.users
    const userSecret = dbMock[username];
    const twofaCode = req.query.twofaCode;

    if (userSecret == null) {
      const secret = speakeasy.generateSecret();
      // TODO: store secret in mongo.users
      dbMock[username] = secret.base32;
      res.status(302).end(`This call is secured with 2FA: ${secret.otpauth_url}`);
    } else {
      if (twofaCode == null) {
        return next(errors.forbidden('Missing 2FA code.'));
      }
      const verified = speakeasy.totp.verify({secret: userSecret, encoding: 'base32', token: twofaCode});
      if (!verified) {
        return next(errors.forbidden('2FA invalid, please try again.'));
      }
      next();
    }
  };
};
