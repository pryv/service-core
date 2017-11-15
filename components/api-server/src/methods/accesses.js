var APIError = require('components/errors').APIError,
    errors = require('components/errors').factory,
    ErrorIds = require('components/errors').ErrorIds,
    async = require('async'),
    commonFns = require('./helpers/commonFunctions'),
    Database = require('components/storage').Database,
    methodsSchema = require('../schema/accessesMethods'),
    accessSchema = require('../schema/access'),
    slugify = require('slug'),
    string = require('./helpers/string'),
    treeUtils = require('components/utils').treeUtils,
    _ = require('lodash');

/**
 * Accesses API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param userStreamsStorage
 * @param notifications
 * @param logging
 */
module.exports = function (api, userAccessesStorage, userStreamsStorage, notifications, logging) {

  var logger = logging.getLogger('methods/accesses'),
      dbFindOptions = {fields: {calls: 0}};

  // COMMON

  api.register('accesses.*',
      commonFns.loadAccess,
      checkNoSharedAccess);

  function checkNoSharedAccess(context, params, result, next) {
    if (context.access.isShared()) {
      return next(errors.forbidden('You cannot access this resource using a shared access token.'));
    }
    next();
  }

  // RETRIEVAL

  api.register('accesses.get',
      commonFns.getParamsValidation(methodsSchema.get.params),
      findAccessibleAccesses);

  function findAccessibleAccesses(context, params, result, next) {
    var query = {};
    if (! context.access.isPersonal()) {
      // app -> only shared accesses
      query.type = 'shared';
    }
    userAccessesStorage.find(context.user, query, dbFindOptions, function (err, accesses) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! context.access.isPersonal()) {
        // filter according to current permissions
        accesses = _.filter(accesses, function (access) {
          return context.access.canManageAccess(access);
        });
      }

      result.accesses = accesses;
      next();
    });
  }


  // CREATION

  api.register('accesses.create',
      applyDefaultsForCreation,
      commonFns.getParamsValidation(methodsSchema.create.params),
      applyPrerequisitesForCreation,
      createDataStructureFromPermissions,
      cleanupPermissions,
      createAccess);

  function applyDefaultsForCreation(context, params, result, next) {
    _.defaults(params, {type: 'shared'});
    next();
  }

  function applyPrerequisitesForCreation(context, params, result, next) {
    if (params.type === 'personal') {
      return next(errors.forbidden('Personal accesses are created automatically on login.'));
    }

    if (! context.access.isPersonal() && ! context.access.canManageAccess(params)) {
      return next(errors.forbidden('Your access token has insufficient permissions to create ' +
          'this new access.'));
    }

    if (params.token) {
      params.token = slugify(params.token);
      if (string.isReservedId(params.token)) {
        return next(errors.invalidItemId('The specified token "' + params.token +
            '" is not allowed.'));
      }
    } else {
      params.token = userAccessesStorage.generateToken();
    }

    context.initTrackingProperties(params);
    next();
  }

  /**
   * Creates default data structure from permissions if needed, for app authorization.
   */
  function createDataStructureFromPermissions(context, params, result, next) {
    if (! context.access.isPersonal() || !params.permissions) {
      return next();
    }

    async.forEachSeries(params.permissions, ensureStream, next);

    function ensureStream(permission, streamCallback) {
      if (! permission.defaultName) { return streamCallback(); }

      var existingStream = treeUtils.findById(context.streams, permission.streamId);

      if (existingStream) {
        if (! existingStream.trashed) { return streamCallback(); }

        var update = {trashed: false};
	userStreamsStorage.updateOne(context.user, {id: existingStream.id}, update, function (err) {
          if (err) { return streamCallback(errors.unexpectedError(err)); }
          streamCallback();
        });
      } else {
        // create new stream
        var newStream = {
          id: permission.streamId,
          name: permission.defaultName,
          parentId: null
        };
        context.initTrackingProperties(newStream);
        userStreamsStorage.insertOne(context.user, newStream, function (err) {
          if (err) {
            if (Database.isDuplicateError(err)) {
              if (isDBDuplicateId(err)) {
                // stream already exists, log & proceed
                logger.info('accesses.create: stream "' + newStream.id + '" already exists: ' +
                    err.message);
              } else {
                // not OK: stream exists with same unique key but different id
                return streamCallback(errors.itemAlreadyExists('stream', {name: newStream.name},
                    err));
              }
            } else {
              return streamCallback(errors.unexpectedError(err));
            }
          }
          streamCallback();
        });
      }
    }
  }

  /**
   * Returns `true` if the given error is a DB "duplicate key" error caused by a duplicate id.
   * Returns `false` otherwise (e.g. if caused by another unique key like the name).
   *
   * @param {Error} dbError
   */
  function isDBDuplicateId(dbError) {
    // HACK: relying on error text as nothing else available to differentiate
    if (! dbError.message) { return false; }
    return dbError.message.indexOf('_id_') > 0;
  }

  /**
   * Returns true if `dbError` was caused by a 'duplicate key' error (E11000)
   * and the key that conflicted was named 'token_1'.
   *
   * @param {Error} dbError
   */
  function isDBDuplicateToken(dbError) {
    if (dbError.message == null) { return false; }
    
    const message = dbError.message; 
    return message.match(/^E11000 duplicate key error collection/) && 
      message.match(/index: token_1 dup key:/);
  }

  /**
   * Strips off the properties in permissions that are used to create the default data structure
   * (for app authorization).
   */
  function cleanupPermissions(context, params, result, next) {
    if (! params.permissions) { return next(); }

    params.permissions.forEach(function (perm) {
      delete perm.defaultName;
      delete perm.name;
    });
    next();
  }

  function createAccess(context, params, result, next) {
    userAccessesStorage.insertOne(context.user, params, function (err, newAccess) {
      if (err) {
        if (Database.isDuplicateError(err)) {
          var conflictingKeys;
          if (isDBDuplicateToken(err)) {
            conflictingKeys = {token: params.token};
          } else {
            conflictingKeys = { type: params.type, name: params.name };
            if (params.deviceName) {
              conflictingKeys.deviceName = params.deviceName;
            }
          }
          return next(errors.itemAlreadyExists('access', conflictingKeys, err));
        } else {
          return next(errors.unexpectedError(err));
        }
      }

      result.access = newAccess;
      notifications.accessesChanged(context.user);
      next();
    });
  }


  // UPDATE

  api.register('accesses.update',
      commonFns.getParamsValidation(methodsSchema.update.params),
      commonFns.catchForbiddenUpdate(accessSchema('update')),
      applyPrerequisitesForUpdate,
      checkAccessForUpdate,
      updateAccess);

  function applyPrerequisitesForUpdate(context, params, result, next) {
    context.updateTrackingProperties(params.update);
    next();
  }

  function checkAccessForUpdate(context, params, result, next) {
    userAccessesStorage.findOne(context.user, {id: params.id}, dbFindOptions,
        function (err, access) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! access) {
        return next(errors.unknownResource('access', params.id, null, { dontNotifyAirbrake: true }));
      }

      if (! context.access.isPersonal() && ! context.access.canManageAccess(access)) {
        return next(errors.forbidden('Your access token has insufficient permissions to ' +
            'modify this access.'));
      }

      context.resource = access;

      next();
    });
  }

  function updateAccess(context, params, result, next) {
    userAccessesStorage.updateOne(context.user, {id: params.id}, params.update,
        function (err, updatedAccess) {
      if (err) {
        if (Database.isDuplicateError(err)) {
          return next(errors.itemAlreadyExists('access',
              { type: context.resource.type, name: params.update.name }, err));
        } else {
          return next(errors.unexpectedError(err));
        }
      }

      // cleanup internal fields
      delete updatedAccess.calls;

      result.access = updatedAccess;
      notifications.accessesChanged(context.user);
      next();
    });
  }


  // DELETION

  api.register('accesses.delete',
      commonFns.getParamsValidation(methodsSchema.del.params),
      checkAccessForDeletion,
      deleteAccess);

  function checkAccessForDeletion(context, params, result, next) {
    userAccessesStorage.findOne(context.user, {id: params.id}, dbFindOptions,
        function (err, access) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! access) {
        return next(errors.unknownResource('access', params.id, null, { dontNotifyAirbrake: true }));
      }

      if (! context.access.isPersonal() && ! context.access.canManageAccess(access)) {
        return next(errors.forbidden('Your access token has insufficient permissions to ' +
            'delete this access.'));
      }

      next();
    });
  }

  function deleteAccess(context, params, result, next) {
    /* jshint -W024 */
    userAccessesStorage.delete(context.user, {id: params.id}, function (err) {
      if (err) { return next(errors.unexpectedError(err)); }

      result.accessDeletion = {id: params.id};
      notifications.accessesChanged(context.user);
      next();
    });
  }


  // OTHER METHODS

  api.register('accesses.checkApp',
      commonFns.getParamsValidation(methodsSchema.checkApp.params),
      checkApp);

  function checkApp(context, params, result, next) {
    if (! context.access.isPersonal()) {
      return next(errors.forbidden('Your access token has insufficient permissions to access ' +
          'this resource.'));
    }

    var query = {
      type: 'app',
      name: params.requestingAppId,
      deviceName: params.deviceName || null
    };
    userAccessesStorage.findOne(context.user, query, dbFindOptions, function (err, access) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (accessMatches(access, params.requestedPermissions)) {
        result.matchingAccess = access;
        next();
      } else {
        if (access) {
          result.mismatchingAccess = access;
        }
        checkPermissions(context, params.requestedPermissions,
            function (err, checkedPermissions, checkError) {
          if (err) { return next(err); } // it's an APIError already

          result.checkedPermissions = checkedPermissions;
          if (checkError) {
            result.error = checkError;
          }
          next();
        });
      }
    });
  }

  /**
   * Tells whether the given access' permissions are the same as those requested.
   *
   * @param {Object} access
   * @param {Array} requestedPermissions
   * @return {Boolean}
   */
  function accessMatches(access, requestedPermissions) {
    if (! access ||
        access.type !== 'app' ||
        access.permissions.length !== requestedPermissions.length) {
      return false;
    }

    var accessPerm, reqPerm;
    for (var i = 0, ni = access.permissions.length; i < ni; i++) {
      accessPerm = access.permissions[i];
      reqPerm = findByStreamId(requestedPermissions, accessPerm.streamId);

      if (! reqPerm ||
          reqPerm.level !== accessPerm.level) {
        return false;
      }
    }

    return true;

    function findByStreamId(permissions, streamId) {
      return _.find(permissions, function (perm) { return perm.streamId === streamId; });
    }
  }

  /**
   * Iterates over the given permissions, replacing `defaultName` properties with the actual `name`
   * of existing streams. When defined, the callback's `checkError` param signals issues
   * with the requested permissions.
   *
   * @param {Object} context
   * @param {Array} permissions
   * @param {Function} callback ({ApiError} error, {Array} checkedPermissions, {Object} checkError)
   */
  function checkPermissions(context, permissions, callback) {
    var checkedPermissions = permissions, // modify permissions in-place, assume no side fx
        checkError = null;
    async.forEachSeries(checkedPermissions, checkPermission, function (err) {
      if (err) {
        return (err instanceof APIError) ?
            callback(err) : callback(errors.unexpectedError(err));
      }
      callback(null, checkedPermissions, checkError);
    });

    function checkPermission(permission, done) {
      if (permission.streamId === '*') {
        // cleanup ignored properties just in case
        delete permission.defaultName;
        return done();
      }

      if (! permission.defaultName) {
        return done(errors.invalidParametersFormat('The parameters\' format is invalid.',
            'The permission for stream "' + permission.streamId + '" (and maybe others) is ' +
                'missing the required "defaultName".'));
      }

      var permissionStream;
      async.series([
        function checkId(stepDone) {
          // NOT-OPTIMIZED: could return only necessary fields
          userStreamsStorage.findOne(context.user, {id: permission.streamId}, null,
              function (err, stream) {
            if (err) { return stepDone(err); }

            permissionStream = stream;

            if (permissionStream) {
              permission.name = permissionStream.name;
              delete permission.defaultName;
            }

            stepDone();
          });
        },
        function checkSimilar(stepDone) {
          if (permissionStream) { return stepDone(); }

          var nameIsUnique = false,
              curSuffixNum = 0;
          async.until(function () { return nameIsUnique; }, checkName, stepDone);

          function checkName(checkDone) {
            var checkedName = getAlternativeName(permission.defaultName, curSuffixNum);
            userStreamsStorage.findOne(context.user, { name: checkedName, parentId: null }, null,
                function (err, stream) {
              if (err) { return checkDone(err); }

              if (! stream) {
                nameIsUnique = true;
                permission.defaultName = checkedName;
              } else {
                curSuffixNum++;
                setCheckError();
              }

              checkDone();
            });
          }
        }
      ], done);
    }

    function setCheckError() {
      if (! checkError) {
        checkError = {
          id: ErrorIds.ItemAlreadyExists,
          message: 'One or more requested streams have the same names as existing streams ' +
              'with different ids. The "defaultName" of the streams concerned have been updated ' +
              'with valid alternative proposals.'
        };
      }
    }

    /**
     * Returns an alternative name proposal from the given base name, by adding a suffix based on
     * the given suffix number. If suffixNum is 0, the base name is left as-is.
     *
     * @param {string} name
     * @param {number} suffixNum
     * @return {string}
     */
    function getAlternativeName(name, suffixNum) {
      return suffixNum === 0 ? name : (name + ' (' + suffixNum + ')');
    }
  }

};
module.exports.injectDependencies = true;
