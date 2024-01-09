/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const updateAccessUsageStats = require('./helpers/updateAccessUsageStats');
const { getConfig } = require('@pryv/boiler');

/**
 * Call tracking functions, to be registered after all methods have been registered.
 *
 * @param api
 */
module.exports = async function (api) {
  const config = await getConfig();
  if (!config.get('accessTracking:isActive')) { return; }
  const updateAccessUsage = await updateAccessUsageStats();
  api.register('*', updateAccessUsage);
};
