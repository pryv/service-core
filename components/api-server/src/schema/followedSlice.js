/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification for followed slices.
 */

const Action = require('./Action');
const helpers = require('./helpers');

/**
 * @param {Action} action
 */
module.exports = function (action) {
  if (action === Action.STORE) { action = Action.READ; } // read items === stored items

  const schema = {
    id: helpers.getTypeURI('followedSlice', action),
    type: 'object',
    additionalProperties: false,
    properties: {
      name: {
        type: 'string',
        minLength: 1
      }
    }
  };

  // explicitly forbid 'id' on create
  if (action !== Action.CREATE) {
    schema.properties.id = {
      type: 'string'
    };
  }

  // only allow url and token on read and create
  if (action === Action.CREATE || action === Action.READ) {
    schema.properties.url = {
      type: 'string',
      minLength: 1
    };
    schema.properties.accessToken = {
      type: 'string',
      minLength: 1
    };
  }

  switch (action) {
    case Action.READ:
      schema.required = ['id', 'name', 'url', 'accessToken'];
      break;
    case Action.CREATE:
      schema.required = ['name', 'url', 'accessToken'];
      break;
  }

  return schema;
};
