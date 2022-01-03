/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification of general methods data.
 */

var Action = require('./Action'),
    access = require('./access'),
    helpers = require('./helpers'),
    object = helpers.object,
    string = helpers.string,
    array = helpers.array;

module.exports = {
  getAccessInfo: {
    params: object({}, {id: 'getAccessInfo'}),
    result: object({
      'type': {
        type: 'string',
        enum: ['personal', 'app', 'shared']
      },
      'name': string(),
      'permissions': access.permissions(Action.READ)
    }, {
      required: [ 'type', 'name', 'permissions' ]
    })
  },

  callBatch: {
    params: array(object({
      'method': string(),
      'params': {
        type: ['object', 'array']
      }
    }, {
      required: [ 'method', 'params' ]
    })),
    result: object({
      'results': array(object({}))
    })
  }
};
