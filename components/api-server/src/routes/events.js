// @flow

import type Application from '../application';

const methodCallback = require('./methodCallback');
const { encryption } = require('components/utils');
const errors = require('components/errors').factory;
const express = require('express');
const _ = require('lodash');

const middleware = require('components/middleware');
const { tryCoerceStringValues } = require('../schema/validation');
const Paths = require('./Paths');
const { hasFileUpload } = require('../middleware/uploads');
const attachmentsAccessMiddleware = require('../middleware/attachment_access');

// Set up events route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  const { settings } = app;
  const storage = app.storageLayer;

  const attachmentsDirPath = settings.get('eventFiles.attachmentsDirPath').str();
  const filesReadTokenSecret = settings.get('auth.filesReadTokenSecret').str();

  const loadAccessMiddleware = middleware.loadAccess(storage);

  const attachmentsStatic = express.static(attachmentsDirPath);
  const events = new express.Router({
    mergeParams: true,
  });

  // This is the path prefix for the routes in this file.
  expressApp.use(Paths.Events, events);

  events.get('/',
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      const params = _.extend({}, req.query);
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
        includeDeletions: 'boolean',
      });
      api.call('events.get', req.context, params, methodCallback(res, next, 200));
    });

  events.get('/:id',
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      const params = _.extend({ id: req.params.id }, req.query);
      tryCoerceStringValues(params, {
        includeHistory: 'boolean',
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
  expressApp.get(`${Paths.Events}/:id/:fileId/:fileName?`,
    retrieveAccessFromReadToken,
    loadAccessMiddleware,
    attachmentsAccessMiddleware(storage.events),
    attachmentsStatic);

  // Parses the 'readToken' and verifies that the access referred to by id in
  // the token corresponds to a real access and that the signature is valid.
  //
  function retrieveAccessFromReadToken(req: express$Request, res, next) {
    // forbid using access tokens in the URL
    if (req.query.auth != null) {
      return next(errors.invalidAccessToken(
        'Query parameter "auth" is forbidden here, '
        + 'please use the "readToken" instead '
        + 'or provide the auth token in "Authorization" header.',
      ));
    }

    const { readToken } = req.query;

    // If no readToken was given, continue without checking.
    if (readToken == null) return next();

    const tokenParts = encryption.parseFileReadToken(readToken);
    const { accessId } = tokenParts;

    if (accessId == null) return next(errors.invalidAccessToken('Invalid read token.'));

    // Now load the access through the context; then verify the HMAC.
    const { context } = req;
    context.retrieveAccessFromId(storage, accessId)
      .then((access) => {
        const hmacValid = encryption
          .isFileReadTokenHMACValid(
            tokenParts.hmac, req.params.fileId,
            access.token, filesReadTokenSecret,
          );

        if (!hmacValid) { return next(errors.invalidAccessToken('Invalid read token.')); }

        next();
      })
      .catch((err) => next(errors.unexpectedError(err)));

    // The promise chain above calls next on all branches.
  }

  // Create an event.
  events.post('/',
    loadAccessMiddleware,
    hasFileUpload,
    (req: express$Request, res, next) => {
      const params = req.body;
      if (req.files) {
        params.files = req.files;
      }
      api.call('events.create', req.context, params, methodCallback(res, next, 201));
    });

  events.post('/start',
    (req: express$Request, res, next) => next(errors.goneResource()));

  expressApp.put(`${Paths.Events}/:id`,
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('events.update', req.context, { id: req.params.id, update: req.body }, methodCallback(res, next, 200));
    });

  events.post('/stop',
    (req: express$Request, res, next) => next(errors.goneResource()));

  // Update an event
  events.post('/:id',
    loadAccessMiddleware,
    hasFileUpload,
    (req: express$Request, res, next) => {
      const params = {
        id: req.params.id,
        update: {},
      };
      if (req.files) {
        params.files = req.files;
      } else {
        delete params.files; // close possible hole
      }
      api.call('events.update', req.context, params, methodCallback(res, next, 200));
    });

  events.delete('/:id',
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('events.delete', req.context, { id: req.params.id }, methodCallback(res, next, 200));
    });

  events.delete('/:id/:fileId',
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('events.deleteAttachment', req.context, { id: req.params.id, fileId: req.params.fileId }, methodCallback(res, next, 200));
    });
};
