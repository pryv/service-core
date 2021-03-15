/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const bluebird = require('bluebird');

const logger = require('@pryv/boiler').getLogger('audit:validation');

const helpers = require('api-server/src/schema/helpers');
const validator = require('api-server/src/schema/validation');
/**
 * Utilities to validate Messages
 */

const filterSchema = helpers.object({
  methods: helpers.object({
      allowed: helpers.array(helpers.string(), { nullable: false }),
      unallowed: helpers.array(helpers.string(), { nullable: false }),
    },
    {
      id: 'Audit Filter: methods',
      required: ['allowed', 'unallowed'],
      additionalProperties: false,
  }),
  },
  {
    id: 'Audit Filter',  
    additionalProperties: false,
});

 /**
  * @param {identifier} userId 
  * @param {PryvEvent} event 
  */
function eventForUser(userId, event) {
  // validate uiserid
  if (!userId) return 'missing userId passed in validation';
  return eventWithoutUser(event);
}

function eventWithoutUser(event) {
  if (!event) return 'event is null';
  if (!event.type) return 'event.type is missisng';
  if (!event.createdBy) return 'event.createBy is missing';
  if (!event.streamIds || !Array.isArray(event.streamIds) || event.streamIds.length < 1) {
    return 'event.streamIds is invalid';
  }
  const typeSplit = event.type.split('/');
  if (typeSplit[0] !== 'log') {
    return ('event.type is not in the format of "log/*"');
  }
  return true;
}

async function filter(filter) {
  const isValid = validator.validate(filter, filterSchema);
  if (! isValid) {
    console.log('check', isValid)
    throw new Error('Invalid "audit:filter" configuration parameter: \n'
    + JSON.stringify(filter, null, 2)
    + '\n'
    + JSON.stringify(validator.getLastError(), null, 2));
  }
}

module.exports = {
  eventForUser: eventForUser,
  eventWithoutUser: eventWithoutUser,
  filter: filter,
};
