/**
 * @license
 * Copyright (C) 2012–2024 Pryv https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getLogger, getConfig } = require('@pryv/boiler');

/**
 * v1.9.2:
 * - nothing to do
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.9.2');
  logger.info('V1.9.0 => v1.9.2 Migration started');
  logger.info('V1.8.0 => v1.9.2 Migration finished');
  callback();
};
