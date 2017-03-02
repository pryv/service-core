var methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    _ = require('lodash');

/**
 * Followed slices route handling.
 *
 * @param {Object} expressApp
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.FollowedSlices, function (req, res, next) {
    api.call('followedSlices.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.FollowedSlices, function (req, res, next) {
    api.call('followedSlices.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.FollowedSlices + '/:id', function (req, res, next) {
    api.call('followedSlices.update', req.context, { id: req.param('id'), update: req.body },
        methodCallback(res, next, 200));
  });

  expressApp.del(Paths.FollowedSlices + '/:id', function (req, res, next) {
    api.call('followedSlices.delete', req.context, _.extend({ id: req.param('id') }, req.query),
        methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
