/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const boiler = require('../src');
const {getConfigUnsafe, getLogger, getConfig} = require('../src').init({
  appName: 'sample',
  baseConfigDir: path.resolve(__dirname, './configs'),
  extraConfigs: [{
    scope: 'airbrake',
    key: 'logs',
    data: {
      airbrake: {
        active: false,
        projectId: 319858,
        key: '44ca9a107f4546505c7e24c8c598b0c7',
      }
    }
  },{
    scope: 'extra1',
    file: path.resolve(__dirname, './configs/extra-config.yml')
  },{
    scope: 'extra2',
    file: path.resolve(__dirname, './configs/extra-config.json')
  },{
    scope: 'extra3',
    file: path.resolve(__dirname, './configs/extra-config.js')
  },{
    scope: 'extra4',
    data: {
      'extra-4-data': 'extra 4 object loaded'
    }
  },{
    scope: 'extra5',
    key: 'extra-5-data',
    data: 'extra 5 object loaded'
  },
  {
    scope: 'extra-js-async',
    fileAsync: path.resolve(__dirname, './configs/extra-js-async.js')
  },{
    scope: 'pryv.li',
    url: 'https://reg.pryv.li/service/info'
  },{
    scope: 'pryv.me',
    key: 'service',
    url: 'https://reg.pryv.me/service/info'
  },{
    scope: 'pryv.me-def',
    key: 'definitions',
    urlFromKey: 'service:assets:definitions'
  },{
    scope: 'ondisk-scope',
    key: 'ondisk',
    url: 'file://' + path.resolve(__dirname, './remotes/ondisk.json')
  },{
    plugin: require('./plugins/plugin-sync')
  },{
    pluginAsync: require('./plugins/plugin-async')
  }]
}, function() {
  console.log('Ready');
});

const config = getConfigUnsafe(true);


const rootLogger = getLogger();
rootLogger.debug('hello root');

const indexLogger = getLogger('index');
indexLogger.debug('hello index');
indexLogger.info('extra Yaml', config.get('extra-yaml'));
indexLogger.info('extra Json', config.get('extra-json'));
indexLogger.info('extra Js', config.get('extra-js'));
indexLogger.info('extra 4 data', config.get('extra-4-data'));
indexLogger.info('extra 5 data', config.get('extra-5-data'));
indexLogger.info('default yaml', config.get('default-yaml'));
indexLogger.info('Default Service Name', config.get('service:name'));

config.replaceScopeConfig('extra5', {'extra-5-data': 'new Extra 5 data'});
indexLogger.info('extra 5 data', config.get('extra-5-data'));

const subLogger = indexLogger.getLogger('sub');
subLogger.debug('hello sub');
indexLogger.info('plugin sync', config.get('plugin-sync'));
indexLogger.info('hide stuff auth=c08r0xs95xlb1xgssmp6tr7c0000gp', {password: 'toto'});

(async () => { 
  await getConfig();
  await boiler.notifyAirbrake('Hello');
  indexLogger.info('pryv.li serial: ', config.get('serial'));
  indexLogger.info('pryv.me name: ', config.get('service:name'));
  indexLogger.info('Favicon: ', config.get('definitions:favicon:default:url'));
  indexLogger.info('OnDisk: ', config.get('ondisk'));
  indexLogger.info('Plugin async: ', config.get('plugin-async'));
  indexLogger.info('Service Name', config.get('service:name'));
  
  indexLogger.info('Scope of foo', config.getScopeAndValue('foo'));

})();