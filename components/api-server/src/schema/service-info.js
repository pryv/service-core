/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * JSON Schema specification for events.
 */

const helpers = require('./helpers');
const object = helpers.object;
const string = helpers.string;

exports = module.exports = function () {
  const schema = object({
    serial: string(),
    api: string(),
    access: string(),
    register: string(),
    name: string(),
    home: string(),
    support: string(),
    terms: string(),
    eventTypes: string(),
    assets: object({})
  }, {
    required: ['serial', 'api', 'access', 'register', 'name', 'home', 'support', 'terms', 'eventTypes'],
    additionalProperties: false
  });

  return schema;
};
