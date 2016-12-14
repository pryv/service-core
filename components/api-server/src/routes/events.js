var methodCallback = require('./methodCallback'),
    encryption = require('components/utils').encryption,
    errors = require('components/errors').factory,
    express = require('express'),
    filesUploadSupport = require('components/middleware').filesUploadSupport,
    Paths = require('./Paths'),
    tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues,
    _ = require('lodash'),
    ResultBuffer = require('../methods/resultBuffer');


/**
 * Events route handling.
 *
 * @param expressApp
 * @param api
 * @param attachmentsAccessMiddleware
 * @param userAccessesStorage
 * @param authSettings
 * @param eventFilesSettings
 */
module.exports = function (expressApp, api, attachmentsAccessMiddleware, userAccessesStorage,
                           authSettings, eventFilesSettings) {

  var attachmentsStatic = express.static(eventFilesSettings.attachmentsDirPath);

  expressApp.get(Paths.Events, function (req, res, next) {
    // TODO remove it
    var params = _.extend({res: res}, req.query);
    tryCoerceStringValues(params, {
      fromTime: 'number',
      toTime: 'number',
      sortAscending: 'boolean',
      skip: 'number',
      limit: 'number',
      modifiedSince: 'number',
      includeDeletions: 'boolean'
    });
    /*
    api.call('events.get', req.context, params, new ResultBuffer({
      res: res,
      next: next,
      successCode: 200
    }));
     api.call('events.get', req.context, params, methodCallback(res, next, 200));
    */


    function tempApiCall (id, context, params, rBuffer) {
      var fns = api.map[id];
      if (!fns) {
        return rBuffer.next(errors.invalidMethod(id));
      }

      if (context) {
        // add called method id to context for instrumentation
        context.calledMethodId = id;
      }

      require('async').forEachSeries(fns, function (currentFn, next2) {
        try {
          currentFn(context, params, rBuffer, next2);
        } catch (err) {
          next2(err);
        }
      }, function (err) {
        if (err) {
          return rBuffer.next(err instanceof require('components/errors').APIError ?
            err : errors.unexpectedError(err));
        }
        //rBuffer.end();
      });
    }

    tempApiCall('events.get', req.context, params, new ResultBuffer({
      res: res,
      next: next,
      successCode: 200
    }));
  });

  /**
   * Serving attached files isn't done via API methods for now, so we must load the access here.
   */
  expressApp.get(Paths.Events + '/:id/:fileId/:fileName?', retrieveAccessFromReadToken, loadAccess,
      attachmentsAccessMiddleware, attachmentsStatic);

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

  expressApp.post(Paths.Events, filesUploadSupport, function (req, res, next) {
    var params = req.body;
    if (req.files) {
      params.files = req.files;
    }
    api.call('events.create', req.context, params, methodCallback(res, next, 201));
  });

  expressApp.post(Paths.Events + '/start', function (req, res, next) {
    api.call('events.start', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Events + '/:id', function (req, res, next) {
    api.call('events.update', req.context, { id: req.param('id'), update: req.body },
        methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Events + '/stop', function (req, res, next) {
    api.call('events.stop', req.context, _.extend({}, req.body), methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Events + '/:id', filesUploadSupport, function (req, res, next) {
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

  expressApp.del(Paths.Events + '/:id', function (req, res, next) {
    api.call('events.delete', req.context, {id: req.param('id')},
        methodCallback(res, next, 200));
  });

  expressApp.del(Paths.Events + '/:id/:fileId', function (req, res, next) {
    api.call('events.deleteAttachment', req.context,
        {id: req.params.id, fileId: req.params.fileId}, methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
