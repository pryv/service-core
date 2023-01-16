/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of general methods data.
 */

const Action = require('./Action');
const access = require('./access');
const helpers = require('./helpers');
const object = helpers.object;
const string = helpers.string;
const array = helpers.array;

module.exports = {
  getAccessInfo: {
    params: object({}, { id: 'getAccessInfo' }),
    result: object({
      type: {
        type: 'string',
        enum: ['personal', 'app', 'shared']
      },
      name: string(),
      permissions: access.permissions(Action.READ)
    }, {
      required: ['type', 'name', 'permissions']
    })
  },

  callBatch: {
    params: array(object({
      method: string(),
      params: {
        type: ['object', 'array']
      }
    }, {
      required: ['method', 'params']
    })),
    result: object({
      results: array(object({}))
    })
  }
};
