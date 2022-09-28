/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Dumps test data into a `data` subfolder named after the provided version.
 * See `../src/data` for details.
 */

const path = require('path');
require('@pryv/boiler').init({
  appName: 'dump-test-data',
  baseConfigDir: path.resolve(__dirname, '../../api-server/config/'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    }, 
    {
      scope: 'defaults-paths',
      file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
    },
    {
      plugin: require(path.resolve(__dirname, '../../api-server/config/components/systemStreams'))
    },
    {
      plugin: require(path.resolve(__dirname, '../../api-server/config/public-url'))
    },
    {
      plugin: require(path.resolve(__dirname, '../../api-server/config/config-validation'))
    }
  ]
});

const { getConfig } = require('@pryv/boiler');
const bluebird = require('bluebird');

// don't add additional layer of ".." as this script is meant to be launched with babel-node as per the package.json script
// it does require the "ln -s ../components components" symlink in the root node_modules/ of the projet
const mongoFolder = __dirname + '/../../../../var-pryv/mongodb-bin';

const version = process.argv[2];
if (version == null) {
  console.error('Please provide version as first argument');
  process.exit(1);
}



(async () => {
  let hasErr = false;
  await getConfig();
  const testData = require('../src/data');
  try {
    await bluebird.fromCallback(cb => testData.dumpCurrent(mongoFolder, version, cb));
  } catch (err) {
    console.error(err);
    hasErr = true;
  }
  process.exit(hasErr ? 1 : 0);
})();


