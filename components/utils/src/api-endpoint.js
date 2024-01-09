/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getConfigUnsafe } = require('@pryv/boiler');

let defaultApiFormat;
/**
 * @param {string} username
 * @param {string} token
 * @param {string} [apiFormat] - (default the one of config "service:api") https://{username}.domain/ or https://hostname/{username}/
 */
function build (username, token, apiFormat) {
  if (!defaultApiFormat) { defaultApiFormat = getConfigUnsafe().get('service:api'); }
  apiFormat = apiFormat || defaultApiFormat;
  let apiEndpoint = apiFormat.replace('{username}', username);
  if (token) {
    const endpointElements = apiEndpoint.split('//');
    endpointElements[1] = `${token}@${endpointElements[1]}`;
    apiEndpoint = endpointElements.join('//');
  }
  return apiEndpoint;
}

module.exports = {
  build
};
