'use strict'; 
// @flow

const morgan = require('morgan');

interface LoggerFactory {
  getLogger(name: string): Logger; 
}
interface Logger {
  info(msg: string): void; 
}

/** Adaptor to be able to use a logger as a stream for morgan. 
 * 
 * Will write messages as if you called `logger.info`.
 */
class LoggerToStream {
  logger: Logger; 
  
  constructor(logger: Logger) {
    this.logger = logger; 
  }
  
  write(message: string) {
    this.logger.info(message);
  }
}

module.exports = function (express: any, logging: LoggerFactory) {
  const logger = logging.getLogger('routes');
  const loggerStream = new LoggerToStream(logger);
  
  return morgan('combined', {stream: loggerStream});
};
module.exports.injectDependencies = true; // make it DI-friendly
