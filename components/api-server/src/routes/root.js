var setCommonMeta = require('../methods/setCommonMeta'),
    methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    _ = require('lodash');

/**
 * Root route :P handling.
 *
 * @param {Object} expressApp
 * @param api
 * @param {Function} initContextMiddleware
 */
module.exports = function (expressApp, api, initContextMiddleware) {

  // ROOT

  /**
   * Accept `OPTIONS`.
   */
  expressApp.options('*', function (req, res) {
    res.send(200);
  });

  /**
   * Bootstrap to user's Pryv page (i.e. browser home).
   */
  expressApp.get('/', rootIndex);

  // USER ROOT

  /**
   * Load user for all user API methods.
   */
  expressApp.get(Paths.UserRoot + '/*', initContextMiddleware);
  expressApp.post(Paths.UserRoot + '/*', initContextMiddleware);
  expressApp.put(Paths.UserRoot + '/*', initContextMiddleware);
  expressApp.del(Paths.UserRoot + '/*', initContextMiddleware);

  expressApp.get(Paths.UserRoot + '/', rootIndex);

  /**
   * Current access information.
   */
  expressApp.get(Paths.UserRoot + '/access-info', function (req, res, next) {
    api.call('getAccessInfo', req.context, req.query, methodCallback(res, next, 200));
  });

  /**
   * Batch request of multiple API method calls.
   */
  expressApp.post(Paths.UserRoot, initContextMiddleware, function (req, res, next) {
    api.call('callBatch', req.context, req.body, methodCallback(res, next, 200));
  });

  var devSiteURL = 'https://api.pryv.com/';
  function rootIndex(req, res) {
    var result = setCommonMeta({});
    if (req.accepts('application/json')) {
      res.json(_.extend(result, {
        cheersFrom: 'Pryv API',
        learnMoreAt: devSiteURL
      }));
    } else {
      res.send('# Cheers from the Pryv API!\n\n' +
          '- API version: ' + result.meta.apiVersion + '\n' +
          '- Server time: ' + result.meta.serverTime + '\n\n' +
          'Learn more at ' + devSiteURL);
    }
  }

};
module.exports.injectDependencies = true;
