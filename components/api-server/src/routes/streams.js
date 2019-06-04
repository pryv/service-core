// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues;
const _ = require('lodash');

import type API from '../API';

// Event streams route handling.
module.exports = function (expressApp: express$Application, api: API) {

  expressApp.get(Paths.Streams, function (req: express$Request, res, next) {
    var params = _.extend({}, req.query);
    tryCoerceStringValues(params, {
      includeDeletionsSince: 'number'
    });
    api.call('streams.get', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Streams, function (req: express$Request, res, next) {
    api.call('streams.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Streams + '/:id', function (req: express$Request, res, next) {
    api.call('streams.update', req.context, { id: req.params.id, update: req.body },
      methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Streams + '/:id', function (req: express$Request, res, next) {
    var params = _.extend({id: req.params.id}, req.query);
    tryCoerceStringValues(params, {
      mergeEventsWithParent: 'boolean'
    });
    api.call('streams.delete', req.context, params,
      methodCallback(res, next, 200));
  });

};
