/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Utility to read syslog 
 * For now only tested on OSX
 */
const { spawn } = require('child_process');

function SyslogWatch(stringToMatch) {

  return syslogWatch;

  function syslogWatch(readyCallBack, done) {
    const child = spawn('syslog',['-w', '0']);
    let killed = false;
    let buffer = '';
    let result = null;

    setTimeout(readyCallBack, 1500); // give a chance for syslog to process trailing requests

    setTimeout(notFound, 5000); // close and throw notFound Error

    function notFound() {
      if (killed) return;
      killed = true;
      child.kill();
      done(new Error('Not Found'));
    }


    function handleData(from, data) {
      buffer += data;
      const pos = buffer.indexOf(stringToMatch);
      if (pos >= 0) {
        // extract the line for stringToMatch
        let end = buffer.indexOf('\n', pos);
        if (end <= 0) { 
          end = buffer.length;
        }
        result = buffer.substring(pos, end);
        child.kill();
      }
    }

    child.stderr.on('data', (data) => {
      handleData('stderr', data);
    });


    child.stdout.on('data', (data) => {
      handleData('stdout', data);
    });
    
    child.on('exit', function (code, signal) {
      if (killed) return;
      killed = true;
      if (result) return done(null, result);
      done(new Error('child process exited with ' +
      `code ${code} and signal ${signal}`));
    });
  }

}
module.exports = SyslogWatch;
