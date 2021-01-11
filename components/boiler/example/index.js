/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const {gifnoc, getReggol, getGifnoc} = require('../src').init({
  appName: 'sample',
  baseConfigDir: path.resolve(__dirname, './configs'),
  extraConfigs: [{
    scope: 'extra1',
    file: path.resolve(__dirname, './configs/extra-config.yaml')
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


const rootLogger = getReggol();
rootLogger.debug('hello root');

const indexLogger = getReggol('index');
indexLogger.debug('hello index');
indexLogger.info('extra Yaml', gifnoc.get('extra-yaml'));
indexLogger.info('extra Json', gifnoc.get('extra-json'));
indexLogger.info('extra Js', gifnoc.get('extra-js'));
indexLogger.info('extra 4 data', gifnoc.get('extra-4-data'));
indexLogger.info('extra 5 data', gifnoc.get('extra-5-data'));
indexLogger.info('default yaml', gifnoc.get('default-yaml'));
indexLogger.info('Default Service Name', gifnoc.get('service:name'));

gifnoc.replaceScopeConfig('extra5', {'extra-5-data': 'new Extra 5 data'});
indexLogger.info('extra 5 data', gifnoc.get('extra-5-data'));

const subLogger = indexLogger.getReggol('sub');
subLogger.debug('hello sub');
indexLogger.info('plugin sync', gifnoc.get('plugin-sync'));
indexLogger.info('hide stuff auth=c08r0xs95xlb1xgssmp6tr7c0000gp', {password: 'toto'});

(async () => { 
  await getGifnoc();
  indexLogger.info('pryv.li serial: ', gifnoc.get('serial'));
  indexLogger.info('pryv.me name: ', gifnoc.get('service:name'));
  indexLogger.info('Favicon: ', gifnoc.get('definitions:favicon:default:url'));
  indexLogger.info('OnDisk: ', gifnoc.get('ondisk'));
  indexLogger.info('Plugin async: ', gifnoc.get('plugin-async'));
  indexLogger.info('Service Name', gifnoc.get('service:name'));
})();