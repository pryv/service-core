/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('./methodCallback');
const encryption = require('utils').encryption;
const errors = require('errors').factory;
const express = require('express');
const Paths = require('./Paths');
const tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues;
const _ = require('lodash');

const middleware = require('middleware');
const { setMethodId } = require('middleware');
const hasFileUpload = require('../middleware/uploads').hasFileUpload;
const attachmentsAccessMiddleware = require('../middleware/attachment_access');

import type Application  from '../application';

// Set up events route handling.
module.exports = function(expressApp: express$Application, app: Application) {
  const api = app.api;
  const config = app.config;
  const storage = app.storageLayer;

  const attachmentsDirPath = config.get('eventFiles:attachmentsDirPath');
  const filesReadTokenSecret = config.get('auth:filesReadTokenSecret');

  const loadAccessMiddleware = middleware.loadAccess(storage);

  const attachmentsStatic = express.static(attachmentsDirPath);
  const events = new express.Router({
    mergeParams: true
  });
  
  // This is the path prefix for the routes in this file. 
  expressApp.use(Paths.Events, events);

  events.get('/',
    setMethodId('events.get'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = _.extend({}, req.query);
      tryCoerceStringValues(req.context.params, {
        fromTime: 'number',
        toTime: 'number',
        streams: 'object',
        tags: 'array',
        types: 'array',
        sortAscending: 'boolean',
        skip: 'number',
        limit: 'number',
        modifiedSince: 'number',
        includeDeletions: 'boolean'
      });
      api.call(req.context, methodCallback(res, next, 200));
    });

  events.get('/:id',
    setMethodId('events.getOne'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = _.extend({id: req.params.id}, req.query);
      tryCoerceStringValues(req.context.params, {
        includeHistory: 'boolean'
      });
      api.call(req.context, methodCallback(res, next, 200));
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
    setMethodId('events.getAttachment'),
    retrieveAccessFromReadToken, 
    loadAccessMiddleware,
    attachmentsAccessMiddleware(storage.events), 
    attachmentsStatic
  );

  // Parses the 'readToken' and verifies that the access referred to by id in 
  // the token corresponds to a real access and that the signature is valid. 
  // 
  function retrieveAccessFromReadToken(req: express$Request, res, next) {
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
    context.retrieveAccessFromId(storage, accessId)
      .then(access => {
        const hmacValid = encryption
          .isFileReadTokenHMACValid(
            tokenParts.hmac, req.params.fileId, 
            access.token, filesReadTokenSecret);

        if (! hmacValid) 
          return next(errors.invalidAccessToken('Invalid read token.'));
          
        next();
      })
      .catch( err => next(errors.unexpectedError(err)) );
    
    return; // The promise chain above calls next on all branches.
  }

  // Create an event.
  events.post('/', 
    setMethodId('events.create'),
    loadAccessMiddleware,
    hasFileUpload,
    function (req: express$Request, res, next) {
      req.context.params = req.body;
      if (req.files) {
        req.context.params.files = req.files;
      }
      api.call(req.context, methodCallback(res, next, 201));
    });

  events.post('/start',
    function (req: express$Request, res, next) {
      return next(errors.goneResource());
    });

  expressApp.put(Paths.Events + '/:id',
    setMethodId('events.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = { id: req.params.id, update: req.body };
      api.call(req.context, methodCallback(res, next, 200));
    });

  events.post('/stop',
    function (req: express$Request, res, next) {
      return next(errors.goneResource());
    });
  
  // Update an event
  events.post('/:id',
    setMethodId('events.update'),
    loadAccessMiddleware,
    hasFileUpload,
    function (req: express$Request, res, next) {
      req.context.params = {
        id: req.params.id,
        update: {}
      };
      if (req.files) {
        req.context.params.files = req.files;
      } else {
        delete req.context.params.files; // close possible hole
      }
      api.call(req.context, methodCallback(res, next, 200));
    });

  events.delete('/:id',
    setMethodId('events.delete'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = {id: req.params.id};
      api.call(req.context, methodCallback(res, next, 200));
    });

  events.delete('/:id/:fileId',
    setMethodId('events.deleteAttachment'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = {id: req.params.id, fileId: req.params.fileId};
      api.call(req.context, methodCallback(res, next, 200));
    });

};
