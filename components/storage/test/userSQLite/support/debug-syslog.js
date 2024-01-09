/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
require('test-helpers/src/api-server-tests-config');
const { getConfig } = require('@pryv/boiler');

const syslogWatch = require('./SyslogWatch');
const { getSyslog } = require('audit/src/syslog');

function lookFor (str) {
  syslogWatch(str)(
    function read () {
      console.log('Ready');
    }, function (err) {
      console.log('done', err);
    });
}

(async () => {
  await getConfig();
  const syslog = await getSyslog();
  lookFor('toto');
  syslog.syslogger.log('info', 'toto');
})();
