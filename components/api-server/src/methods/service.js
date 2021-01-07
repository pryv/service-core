/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

import type { MethodContext } from 'components/model';
import type API from '../API';
import type { ApiCallback } from '../API';
import type Result from '../Result';

const _ = require('lodash');
const { getGifnoc } = require('boiler');

module.exports = function (api: API) {
  this.serviceInfo = null;

  api.register('service.info',
    getServiceInfo
  );

  async function getServiceInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {  
    if (! this.serviceInfo) {
      this.serviceInfo = (await getGifnoc()).get('service');
    }
    result = _.merge(result, this.serviceInfo);
    return next();
  }
};
