const methodCallback = require('./methodCallback');
const encryption = require('components/utils').encryption;
const errors = require('components/errors').factory;
const express = require('express');
const Paths = require('./Paths');
const tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues;
const _ = require('lodash');

const bluebird = require('bluebird');  

const hasFileUpload = require('../middleware/uploads').hasFileUpload;
const attachmentsAccessMiddleware = require('../middleware/attachment_access');
/**
 * Set up events route handling.
 */
module.exports = function(
  expressApp, 
  api, userAccessesStorage,
  authSettings, eventFilesSettings, storageLayer
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
    attachmentsAccessMiddleware(storageLayer.events), 
    attachmentsStatic);

  function retrieveAccessFromReadToken(req, res, next) {
    if (req.query.auth) {
      // forbid using access tokens in the URL
      return next(errors.invalidAccessToken(
        'Query parameter "auth" is forbidden here, ' +
        'please use the "readToken" instead ' +
        'or provide the auth token in "Authorization" header.'));
    }

    if (! req.query.readToken) { return next(); }

    var tokenParts = encryption.parseFileReadToken(req.query.readToken);
    if (! tokenParts.accessId) {
      return next(errors.invalidAccessToken(
        'Invalid read token "' + req.query.readToken + '".'));
    }

    userAccessesStorage.findOne(req.context.user, {id: tokenParts.accessId}, null,
      function (err, access) {
        if (err) { return next(errors.unexpectedError(err)); }

        if (! access) {
          return next(errors.invalidAccessToken('Cannot find access matching read token "' +
              req.query.readToken + '".'));
        }

        if (! encryption.isFileReadTokenHMACValid(tokenParts.hmac, req.params.fileId, access, authSettings.filesReadTokenSecret)) {
          return next(errors.invalidAccessToken('Invalid read token "' + req.query.readToken + '".'));
        }

        req.context.access = access;
        next();
      });
  }

  function loadAccess(req, res, next) {
    const context = req.context; 
    
    return bluebird.resolve(
      context.retrieveExpandedAccess(storageLayer)).asCallback(next);
  }

  // Create an event.
  events.post('/', 
    hasFileUpload,
    function (req, res, next) {
      const params = req.body;
      if (req.files) {
        params.files = req.files;
      }
      api.call('events.create', req.context, params, methodCallback(res, next, 201));
    });

  events.post('/start', function (req, res, next) {
    api.call('events.start', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Events + '/:id', function (req, res, next) {
    api.call('events.update', req.context, { id: req.param('id'), update: req.body }, methodCallback(res, next, 200));
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
    api.call('events.delete', req.context, {id: req.params.id}, methodCallback(res, next, 200));
  });

  events.delete('/:id/:fileId', function (req, res, next) {
    api.call('events.deleteAttachment', req.context, {id: req.params.id, fileId: req.params.fileId}, methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;

