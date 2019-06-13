module.exports = function (api, logging) {

  const logger = logging.getLogger('methods/service');

  // RETRIEVAL

  api.register('service.infos',
    getServiceInfo
  );

  function getServiceInfo()
  {
    let serviceInfos = {};

    setConfig(serviceInfos, 'register', 'http:register:url'); // TODO
    setConfig(serviceInfos, 'name', 'service:name');
    setConfig(serviceInfos, 'home', 'http:static:url');
    setConfig(serviceInfos, 'support', 'service:support');
    setConfig(serviceInfos, 'terms', 'service:terms');
    setConfig(serviceInfos, 'event-types', 'eventTypes:sourceURL');

    return serviceInfos;
  }

  function setConfig(serviceInfos, memberName, configPath) {
    const value = config.get(configPath); // TODO config !
    if(value)
      serviceInfos[memberName] = value;
  }
};
module.exports.injectDependencies = true;
