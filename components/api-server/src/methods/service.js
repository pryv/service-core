// @flow

import type { MethodContext } from 'components/model';
import type API from '../API';
import type { ApiCallback } from '../API';
import type Result from '../Result';
import type { Logger } from 'components/utils';
import type { ConfigAccess } from '../settings';

const _ = require('lodash');

module.exports = function (api: API, logger: Logger, settings: ConfigAccess) {

  api.register('service.infos',
    getServiceInfo
  );

  async function getServiceInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    await settings.loadRegisterInfo();

    const serviceInfosSettings = {};
    setConfig(serviceInfosSettings, settings, 'serial', 'serial');
    setConfig(serviceInfosSettings, settings, 'access', 'access');
    setConfig(serviceInfosSettings, settings, 'api', 'api');
    setConfig(serviceInfosSettings, settings, 'register', 'http.register.url');
    setConfig(serviceInfosSettings, settings, 'name', 'service.name');
    setConfig(serviceInfosSettings, settings, 'home', 'http.static.url');
    setConfig(serviceInfosSettings, settings, 'support', 'service.support');
    setConfig(serviceInfosSettings, settings, 'terms', 'service.terms');
    setConfig(serviceInfosSettings, settings, 'eventTypes', 'eventTypes.sourceURL');

    result = _.merge(result, serviceInfosSettings);
    return next();
  }

  function setConfig(serviceInfos: Object, settings: ConfigAccess, memberName: string, configKey: string) {
    const param = settings.get(configKey);
    if(!param) {
      logger.warn('Unable to get \'' + memberName + '\' from Settings, please check configuration');
      return;
    }
    serviceInfos[memberName] = param.value;
  }

};
