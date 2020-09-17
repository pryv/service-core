/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of methods data for system.
 */

var Action = require('./Action'),
    helpers = require('./helpers'),
    user = require('./user');

module.exports = {
  createUser: {
    params: user(Action.CREATE),
    result: {
      type: 'object',
      additionalProperties: false,
      properties: {
        'id': {
          type: 'string'
        }
      }
    }
  },
  getUserInfo: {
    params: helpers.object({
      username: helpers.string()
    }, {
      required: [ 'username' ]
    }),
    result: helpers.object({
      userInfo: helpers.object({
        username: helpers.string(),
        lastAccess: helpers.number(),
        callsTotal: helpers.number(),
        callsDetail: helpers.object({}),
        callsPerAccess: helpers.object({}),
        storageUsed: user(Action.READ).properties.storageUsed
      }, {
        additionalProperties: false,
        required: [ 'username', 'lastAccess', 'callsTotal', 'callsDetail', 'storageUsed' ]
      })
    }, {
      required: [ 'userInfo' ]
    })
  }
};
