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
  * @param {identifier} userid 
  * @param {PryvEvent} event 
  */
function eventForUser(userid, event) {
  // validate uiserid
  if (!userid) return 'missing userid';
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
