/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// npx link ../pryv-datastore
// launch with NODE_ENV=test LOGS=info node startRestServer.js

// keep a copy of error functions to reaasign back
const { errors: dataStoreErrors } = require('@pryv/datastore');
const originalErrors = Object.assign({}, dataStoreErrors);

const path = require('path');
const eventsUtils = require('mall/src/helpers/eventsUtils');
const stableRepresentation = require('@pryv/stable-object-representation');

const { getConfig } = require('@pryv/boiler').init({
  appName: 'rest',
  baseFilesDir: path.resolve(__dirname, './'),
  baseConfigDir: path.resolve(__dirname, './components/api-server/config/'),
  extraConfigs: [

    {
      scope: 'default-paths',
      file: path.resolve(__dirname, './components/api-server/config/paths-config.js')
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    },
    {
      plugin: require('api-server/config/public-url')
    },
    {
      scope: 'default-audit',
      file: path.resolve(__dirname, 'audit/config/default-config.yml')
    },
    {
      scope: 'default-audit-path',
      file: path.resolve(__dirname, 'audit/config/default-path.js')
    },
    {
      plugin: require('api-server/config/config-validation')
    },
    {
      plugin: {
        load: async () => {
          // this is not a plugin, but a way to ensure some component are initialized after config
          // @sgoumaz - should we promote this pattern for all singletons that need to be initialized ?
          const SystemStreamsSerializer = require('business/src/system-streams/serializer');
          await SystemStreamsSerializer.init();
        }
      }
    }
  ]
});

const ds = require('storage/src/localDataStoreSQLite/');

const server = require('@pryv/datastore/examples/rest/server');

function debugMiddleware (req, res, next) {
  // console.log({ method: req.method, url: req.url, body: req.body });
  next();
}

(async function () {
  // data store errors have been assigned by storeDataUtils assign them back to PryvDataStoreError
  Object.assign(dataStoreErrors, originalErrors);

  const config = await getConfig();
  const algorithm = config.get('integrity:algorithm');
  function setIntegrityForEvent (storeEventData) {
    const event = eventsUtils.convertEventFromStore('local', storeEventData);
    storeEventData.integrity = stableRepresentation.event.compute(event, algorithm).integrity;
  }

  const localSettings = {
    attachments: { setFileReadToken: true },
    versioning: config.get('versioning')
  };

  await ds.init({ id: 'local', name: 'Local', settings: localSettings, integrity: { setOnEvent: setIntegrityForEvent } });
  await server(ds, 6789, { middleware: debugMiddleware });
})();
