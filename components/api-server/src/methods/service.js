// @flow

import type { MethodContext } from 'components/model';
import type API from '../API';
import type { ApiCallback } from '../API';
import type Notifications from '../Notifications';
import type Result from '../Result';
import type { Logger } from 'components/utils';
import type { ConfigAccess } from './settings';

module.exports = function (api: API, logger: Logger, settings: ConfigAccess) {

  api.register('service.infos',
    getServiceInfo
  );

  function getServiceInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    // Deep copy settings directly into result
    // @Ilia : a better way to do this ?
    for (const key of Object.keys(settings))
      result[key] = settings[key];

    return next();
  }
};
