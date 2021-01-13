/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'; 
// @flow

const morgan = require('morgan');
const { getLogger } = require('boiler');

module.exports = function (express: any) {
  const logger = getLogger('request-trace');
  const morganLoggerStreamWrite = (msg: string) => logger.info(msg);
  
  return morgan('combined', {stream: {
    write: morganLoggerStreamWrite
  }});
};
