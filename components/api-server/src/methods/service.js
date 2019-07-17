// @flow

import type { MethodContext } from 'components/model';
import type API from '../API';
import type { ApiCallback } from '../API';
import type Result from '../Result';
import type { Logger } from 'components/utils';
import type { ConfigAccess } from '../settings';

const _ = require('lodash');

module.exports = function (api: API, logger: Logger, settings: ConfigAccess) {

  api.register('service.info',
    getServiceInfo
  );

  async function getServiceInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    await settings.loadRegisterInfo();

    const serviceInfoSettings = {};
    setConfig(serviceInfoSettings, settings, 'serial', 'serial');
    setConfig(serviceInfoSettings, settings, 'access', 'access');
    setConfig(serviceInfoSettings, settings, 'api', 'api');
    setConfig(serviceInfoSettings, settings, 'register', 'http.register.url');
    setConfig(serviceInfoSettings, settings, 'name', 'service.name');
    setConfig(serviceInfoSettings, settings, 'home', 'http.static.url');
    setConfig(serviceInfoSettings, settings, 'support', 'service.support');
    setConfig(serviceInfoSettings, settings, 'terms', 'service.terms');
    setConfig(serviceInfoSettings, settings, 'eventTypes', 'eventTypes.sourceURL');

    result = _.merge(result, serviceInfoSettings);
    return next();
  }

  function setConfig(serviceInfo: Object, settings: ConfigAccess, memberName: string, configKey: string) {
    const param = settings.get(configKey);
    if(!param) {
      logger.warn('Unable to get \'' + memberName + '\' from Settings, please check configuration');
      return;
    }
    serviceInfo[memberName] = param.value;
  }

};
