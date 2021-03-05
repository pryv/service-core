require('test-helpers/src/boiler-init');
const { getConfig } = require('@pryv/boiler');

const syslogWatch = require('./SyslogWatch');
const { getSyslog } = require('../../src/syslog');

function lookFor(str) {
  syslogWatch(str)(
    function read() {
      console.log('Ready');
  }, function(err) {
    console.log('done', err);
  });
}

(async () => {
  console.log('uuu');
  await getConfig();
  const syslog = await getSyslog();
  lookFor('toto');
  const res = syslog.syslogger.log('info', 'toto');
})();

