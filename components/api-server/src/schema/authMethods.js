/**
 * JSON Schema specification of methods data for auth.
 */

const helpers = require('./helpers');

const { object } = helpers;
const { string } = helpers;

module.exports = {
  login: {
    params: object({
      username: string(),
      password: string(),
      appId: string(),
      origin: string(),
    }, {
      required: ['username', 'password', 'appId'],
      additionalProperties: false,
    }),
    result: object({
      token: string(),
    }, {
      required: ['token'],
      additionalProperties: false,
    }),
  },

  logout: {
    params: object({}),
  },
};
