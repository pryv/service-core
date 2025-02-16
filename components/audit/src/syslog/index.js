/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
