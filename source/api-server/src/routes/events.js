var methodCallback = require('./methodCallback'),
    encryption = require('components/utils').encryption,
    errors = require('components/errors').factory,
    express = require('express'),
    Paths = require('./Paths'),
    tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues,
    _ = require('lodash');
    
const hasFileUpload = require('../middleware/uploads').hasFileUpload;

// import type { $Application as ExpressApplication } from 'express';

/**
 * Set up events route handling.
 *
 * @param expressApp {express$Application} Express application.
 * @param api
 * @param attachmentsAccessMiddleware
 * @param userAccessesStorage
 * @param authSettings
 * @param eventFilesSettings
 */
module.exports = function(
  expressApp, 
  api, attachmentsAccessMiddleware, userAccessesStorage,
  authSettings, eventFilesSettings
) {

  const attachmentsStatic = express.static(
    eventFilesSettings.attachmentsDirPath);
  const events = new express.Router();
  
  // This is the path prefix for the routes in this file. 
  expressApp.use(Paths.Events, events);

  events.get('/', function (req, res, next) {
    var params = _.extend({}, req.query);
    tryCoerceStringValues(params, {
      fromTime: 'number',
      toTime: 'number',
      streams: 'array',
      tags: 'array',
      types: 'array',
      sortAscending: 'boolean',
      skip: 'number',
      limit: 'number',
      modifiedSince: 'number',
      includeDeletions: 'boolean'
    });
    api.call('events.get', req.context, params, methodCallback(res, next, 200));
  });

  // MERGE: Might not be in the right spot...
  expressApp.get(Paths.Events + '/:id', function (req, res, next) {
    var params = _.extend({id: req.params.id}, req.query);
    tryCoerceStringValues(params, {
      includeHistory: 'boolean'
    });
    api.call('events.getOne', req.context, params, methodCallback(res, next, 200));
  });

  // Access an events files
  expressApp.get(Paths.Events + '/:id/:fileId/:fileName?', 
    retrieveAccessFromReadToken, 
    loadAccess,
    attachmentsAccessMiddleware, 
    attachmentsStatic);

  function retrieveAccessFromReadToken(req, res, next) {
    if (req.query.auth) {
      // forbid using access tokens in the URL
      delete req.context.accessToken;
    }

    if (! req.query.readToken) { return next(); }

    var tokenParts = encryption.parseFileReadToken(req.query.readToken);
    if (! tokenParts.accessId) {
      return next(errors.invalidAccessToken('Invalid read token "' + req.query.readToken + '".'));
    }

    userAccessesStorage.findOne(req.context.user, {id: tokenParts.accessId}, null,
      function (err, access) {
        if (err) { return next(errors.unexpectedError(err)); }

        if (! access) {
          return next(errors.invalidAccessToken('Cannot find access matching read token "' +
              req.query.readToken + '".'));
        }

        if (! encryption.isFileReadTokenHMACValid(tokenParts.hmac, req.params.fileId, access,
            authSettings.filesReadTokenSecret)) {
          return next(errors.invalidAccessToken('Invalid read token "' + req.query.readToken + '".'));
        }

        req.context.access = access;
        next();
      });
  }

  function loadAccess(req, res, next) {
    req.context.retrieveExpandedAccess(next);
  }

  // Create an event.
  events.post('/', 
    hasFileUpload,
    function (req, res, next) {
      var params = req.body;
      if (req.files) {
        params.files = req.files;
      }
      api.call('events.create', req.context, params, methodCallback(res, next, 201));
    });

  events.post('/start', function (req, res, next) {
    api.call('events.start', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Events + '/:id', function (req, res, next) {
    api.call('events.update', req.context, { id: req.param('id'), update: req.body },
        methodCallback(res, next, 200));
  });

  events.post('/stop', function (req, res, next) {
    api.call('events.stop', req.context, _.extend({}, req.body), methodCallback(res, next, 200));
  });
  
  // Update an event
  events.post('/:id', hasFileUpload, function (req, res, next) {
    var params = {
      id: req.params.id,
      update: {}
    };
    if (req.files) {
      params.files = req.files;
    } else {
      delete params.files; // close possible hole
    }
    api.call('events.update', req.context, params, methodCallback(res, next, 200));
  });

  events.delete('/:id', function (req, res, next) {
    api.call('events.delete', req.context, {id: req.params.id},
        methodCallback(res, next, 200));
  });

  events.delete('/:id/:fileId', function (req, res, next) {
    api.call('events.deleteAttachment', req.context,
        {id: req.params.id, fileId: req.params.fileId}, methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
