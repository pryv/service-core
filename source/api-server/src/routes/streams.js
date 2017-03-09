var methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues,
    _ = require('lodash');

/**
 * Event streams route handling.
 *
 * @param expressApp
 * @param api
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.Streams, function (req, res, next) {
    var params = _.extend({}, req.query);
    tryCoerceStringValues(params, {
      includeDeletionsSince: 'number'
    });
    api.call('streams.get', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Streams, function (req, res, next) {
    api.call('streams.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Streams + '/:id', function (req, res, next) {
    api.call('streams.update', req.context, { id: req.param('id'), update: req.body },
        methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Streams + '/:id', function (req, res, next) {
    var params = _.extend({id: req.param('id')}, req.query);
    tryCoerceStringValues(params, {
      mergeEventsWithParent: 'boolean'
    });
    api.call('streams.delete', req.context, params,
        methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
