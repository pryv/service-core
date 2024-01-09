/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const _ = require('lodash');
const { getConfig } = require('@pryv/boiler');
module.exports = function (api) {
  this.serviceInfo = null;
  api.register('service.info', getServiceInfo);
  async function getServiceInfo (context, params, result, next) {
    if (!this.serviceInfo) {
      this.serviceInfo = (await getConfig()).get('service');
    }
    result = _.merge(result, this.serviceInfo);
    return next();
  }
};
