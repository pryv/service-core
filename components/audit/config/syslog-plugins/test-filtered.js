/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Test Plugin for syslog
 * 
 * Process {userid} {event} to create a message.
 * Filter message by returning "null" when event.content.skip is true
 */

/** 
 * @param {string} userid 
 * @param {PryvEvent} event
 * @returns {Object} - {level: .. , message: ... }  or null to skip 
 */
module.exports = function(userid, event) {
  if (event.content.skip) {
    return null;
  }
  return {
    level: 'notice',
    message: userid + ' TEST FILTERED ' + event.content.message
  }
}