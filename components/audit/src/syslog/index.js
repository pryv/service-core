/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Syslog = require('./Syslog');

let syslog;

/**
 *@returns {Syslog}
 */
async function getSyslog () {
  if (!syslog) {
    syslog = new Syslog();
    await syslog.init();
  }
  return syslog;
}

module.exports = {
  getSyslog
};
