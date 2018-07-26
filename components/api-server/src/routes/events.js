const methodCallback = require('./methodCallback');
const encryption = require('components/utils').encryption;
const errors = require('components/errors').factory;
const express = require('express');
const Paths = require('./Paths');
const tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues;
const _ = require('lodash');

const hasFileUpload = require('../middleware/uploads').hasFileUpload;
const attachmentsAccessMiddleware = require('../middleware/attachment_access');
/**
 * Set up events route handling.
 */
module.exports = function(
  expressApp, 
  api, authSettings, eventFilesSettings, storageLayer
) {
  
  const attachmentsStatic = express.static(
    eventFilesSettings.attachmentsDirPath);
  const events = new express.Router({
    mergeParams: true
  });
  
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

  events.get('/:id', function (req, res, next) {
    var params = _.extend({id: req.params.id}, req.query);
    tryCoerceStringValues(params, {
      includeHistory: 'boolean'
    });
    api.call('events.getOne', req.context, params, methodCallback(res, next, 200));
  });

  // Access an events files
  // 
  // NOTE This `events.get('/:id/:fileId/:fileName?',`  doesn't work because 
  //  using a Router will hide the username from the code here. It appears that 
  //  the url is directly transformed into a file path in attachmentsAccessMiddleware
  //  and thus if something is missing from the (router-)visible url, something 
  //  will be missing upon file access. 
  // 
  expressApp.get(Paths.Events + '/:id/:fileId/:fileName?', 
    retrieveAccessFromReadToken, 
    loadAccess,
    attachmentsAccessMiddleware(storageLayer.events), 
    attachmentsStatic
  );

  // Parses the 'readToken' and verifies that the access referred to by id in 
  // the token corresponds to a real access and that the signature is valid. 
  // 
  function retrieveAccessFromReadToken(req, res, next) {
    // forbid using access tokens in the URL
    if (req.query.auth != null)
      return next(errors.invalidAccessToken(
        'Query parameter "auth" is forbidden here, ' +
        'please use the "readToken" instead ' +
        'or provide the auth token in "Authorization" header.'));

    const readToken = req.query.readToken;

    // If no readToken was given, continue without checking.
    if (readToken == null) return next();
    
    const tokenParts = encryption.parseFileReadToken(readToken);
    const accessId = tokenParts.accessId;
    
    if (accessId == null)
      return next(errors.invalidAccessToken('Invalid read token.'));
      
    // Now load the access through the context; then verify the HMAC.
    const context = req.context; 
    context.retrieveAccessFromId(storageLayer, accessId)
      .then(access => {
        const hmacValid = encryption
          .isFileReadTokenHMACValid(
            tokenParts.hmac, req.params.fileId, 
            access.token, authSettings.filesReadTokenSecret);

        if (! hmacValid) 
          return next(errors.invalidAccessToken('Invalid read token.'));
          
        next();
      })
      .catch( err => next(errors.unexpectedError(err)) );
    
    return;
  }

  function loadAccess(req, res, next) {
    const context = req.context; 
    
    nextify(context.retrieveExpandedAccess(storageLayer), next); 
  }
  
  // Turns the promise given into a call to an express NextFunction. 
  function nextify(promise, next) {
    promise
      .then(() => next())
      .catch(err => next(err));
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

