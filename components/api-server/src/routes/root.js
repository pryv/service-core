/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const middleware = require('middleware');
const commonMeta = require('../methods/helpers/setCommonMeta');
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const getAuth = require('middleware/src/getAuth');
const { setMethodId } = require('middleware');

(async () => {
  await commonMeta.loadSettings();
})();
// Handlers for path roots at various places; handler for batch calls and
// access-info.
/**
 * @param {express$Application} expressApp
 * @param {Application} app
 * @returns {void}
 */
function root (expressApp, app) {
  const api = app.api;

  const customAuthStepFn = app.getCustomAuthFunction('root.js');
  const initContextMiddleware = middleware.initContext(app.storageLayer, customAuthStepFn);
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  // Bootstrap to user's Pryv page (i.e. browser home).
  expressApp.get('/', rootIndex);
  expressApp.get(Paths.UserRoot + '/', rootIndex);
  // Load user for all user API methods.
  expressApp.all(Paths.UserRoot + '/*', getAuth);
  expressApp.all(Paths.UserRoot + '/*', initContextMiddleware);
  // Current access information.
  expressApp.get(Paths.UserRoot + '/access-info',
    setMethodId('getAccessInfo'),
    loadAccessMiddleware,
    function (req, res, next) {
      api.call(req.context, req.query,
        methodCallback(res, next, 200));
    });

  // Batch request of multiple API method calls.
  expressApp.post(Paths.UserRoot,
    initContextMiddleware,
    setMethodId('callBatch'),
    loadAccessMiddleware,
    function (req, res, next) {
      api.call(req.context, req.body,
        methodCallback(res, next, 200));
    }
  );
}
module.exports = root;

// Renders a greeting message; this route is displayed on the various forms
// of roots ('/', 'foo.pryv.me/')
//
/**
 * @param {express$Request} req
 * @returns {void}
 */
function rootIndex (req, res) {
  const devSiteURL = 'https://api.pryv.com/';
  const result = commonMeta.setCommonMeta({});

  if (req.accepts('application/json')) {
    res.json(_.extend(result, {
      cheersFrom: 'Pryv API',
      learnMoreAt: devSiteURL
    }));
  } else {
    res.send('# Cheers from the Pryv API!\n\n' +
            '- API version: ' +
            result.meta.apiVersion +
            '\n' +
            '- Server time: ' +
            result.meta.serverTime +
            '\n\n' +
            'Learn more at ' +
            devSiteURL);
  }
}
