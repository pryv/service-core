/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const logger = require('@pryv/boiler').getLogger('audit:validation');
/**
 * Utilities to validate Messages
 */

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

module.exports = {
  eventForUser: eventForUser,
}
