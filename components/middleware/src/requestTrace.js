/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'; 
// @flow

const morgan = require('morgan');

interface LoggerFactory {
  getLogger(name: string): Logger; 
}
interface Logger {
  info(msg: string): void; 
}

module.exports = function (logging: LoggerFactory) {
  const logger = logging.getLogger('routes');
  const morganLoggerStreamWrite = (msg: string) => logger.info(msg);
  
  return morgan('combined', {stream: {
    write: morganLoggerStreamWrite
  }});
};
module.exports.injectDependencies = true; // make it DI-friendly
