var errors = require('components/errors').factory,
    Paths = require('./Paths'),
    methodCallback = require('./methodCallback'),
    contentType = require('components/middleware').contentType,
    _ = require('lodash');

/**
 * System (e.g. registration server) calls route handling.
 *
 * @param expressApp
 * @param systemAPI
 * @param authSettings Register authSettings
 * @param logging
 */
module.exports = function system(expressApp, systemAPI, authSettings, logging) {

  var logger = logging.getLogger('routes/system');

  /**
   * Handle common parameters.
   */
  expressApp.all(Paths.System + '*', checkAuth);


  expressApp.post(Paths.System + '/create-user', contentType.json, createUser);
  // temp for backwards-compat, TODO: remove after all reg servers updated
  expressApp.post('/register/create-user', contentType.json, createUser);

  function createUser(req, res, next) {

    let params = _.extend({}, req.body); 
    systemAPI.call('system.createUser', {}, params, methodCallback(res, next, 201));
  }

  expressApp.get(Paths.System + '/user-info/:username', function (req, res, next) {
    var params = {
      username: req.params.username
    };
    systemAPI.call('system.getUserInfo', {}, params, methodCallback(res, next, 200));
  });

  // Checks if `req` contains valid authorization to access the system routes. 
  // 
  function checkAuth(req, res, next) {
    var secret = req.headers.authorization;

    if (secret==null || secret !== authSettings.adminAccessKey) {
      logger.warn('Unauthorized attempt to access system route', {
        url: req.url,
        ip: req.ip,
        headers: req.headers,
        body: req.body });
      
      // return "not found" to avoid encouraging retries
      return next(errors.unknownResource());
    }

    next();
  }
};
module.exports.injectDependencies = true;

