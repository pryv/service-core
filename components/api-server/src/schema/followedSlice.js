/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
