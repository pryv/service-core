// @flow

const async = require('async');
const slugify = require('slug');
const _ = require('lodash');
const timestamp = require('unix-timestamp');

const APIError = require('components/errors').APIError;
const errors = require('components/errors').factory;
const ErrorIds = require('components/errors').ErrorIds;

const Database = require('components/storage').Database;
const treeUtils = require('components/utils').treeUtils;

const commonFns = require('./helpers/commonFunctions');
const methodsSchema = require('../schema/accessesMethods');
const accessSchema = require('../schema/access');
const string = require('./helpers/string');

import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils';
import type { MethodContext } from 'components/model';

import type API from '../API';
import type { ApiCallback } from '../API';
import type Notifications from '../Notifications';
import type Result from '../Result';

type Permission = {
  streamId: string, 
  level: 'manage' | 'contribute' | 'read',
};
type Access = {
  type: 'personal' | 'app' | 'shared',
  permissions: Array<Permission>,
  expires: ?number,
  clientData: ?{},
};

type UpdatesSettingsHolder = {
  ignoreProtectedFields: boolean,
}

module.exports = function produceAccessesApiMethods(
  api: API, 
  logger: Logger, 
  notifications: Notifications, 
  updatesSettings: UpdatesSettingsHolder, 
  storageLayer: StorageLayer) 
{
  const dbFindOptions = { projection: 
    { calls: 0, deleted: 0 } };

  // COMMON

  api.register('accesses.*',
    commonFns.loadAccess(storageLayer),
    checkNoSharedAccess);

  function checkNoSharedAccess(
    context: MethodContext, params: mixed, result: Result, next: ApiCallback) 
  {
    const access = context.access;
    
    if (access == null || access.isShared()) {
      return next(errors.forbidden(
        'You cannot access this resource using a shared access token.')
      );
    }
    
    next();
  }

  // RETRIEVAL

  api.register('accesses.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    findAccessibleAccesses,
    includeDeletionsIfRequested
  );

  function findAccessibleAccesses(context, params, result, next) {
    const currentAccess = context.access;
    const accessesRepository = storageLayer.accesses;
    const query = {};
    
    if (currentAccess == null) 
      return next(new Error('AF: Access cannot be null at this point.'));
    
    if (! currentAccess.isPersonal()) {
      // app -> only shared accesses
      query.type = 'shared';
    }
    accessesRepository.find(context.user, query, dbFindOptions, function (err, accesses) {
      if (err != null) return next(errors.unexpectedError(err)); 
      
      // We'll perform a few filter steps on this list, so let's start a chain.
      let chain = _.chain(accesses);
      
      // Filter accesses that we cannot manage
      chain = chain.filter(a => currentAccess.canManageAccess(a));
        
      // Filter expired accesses (maybe)
      chain = maybeFilterExpired(params, chain);

      // Return the chain result.
      result.accesses = chain.value();
      
      next();
    });
    
    // Depending on 'includeExpired' in the query string, adds a filter to
    // `chain` that filters expired accesses.
    // 
    function maybeFilterExpired(params, chain: lodash$Chain<Access>) {
      const includeExpiredParam = params.includeExpired;
                  
      // If we also want to see expired accesses, don't filter them.
      if (includeExpiredParam === 'true' || includeExpiredParam === '1') 
        return chain;
      
      return chain.reject(
        a => isAccessExpired(a));
    }
  }

  function includeDeletionsIfRequested(context, params, result, next) {
    if (params.includeDeletions == null) { return next(); }

    const currentAccess = context.access;
    const accessesRepository = storageLayer.accesses;

    accessesRepository.findDeletions(context.user, { projection: { calls: 0 } },
      function (err, deletions) {
        if (err) { return next(errors.unexpectedError(err)); }

        result.accessDeletions = deletions.filter(a => currentAccess.canManageAccess(a));
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
      return next(errors.forbidden(
        'Personal accesses are created automatically on login.'
      ));
    }
    
    const access = context.access;
    if (access == null) 
      return next(errors.unexpectedError('AF: Access must not be null here.'));

    if (! access.canManageAccess(params)) {
      return next(errors.forbidden(
        'Your access token has insufficient permissions ' +
        'to create this new access.'));
    }

    if (params.token != null) {
      params.token = slugify(params.token);
      if (string.isReservedId(params.token)) {
        return next(errors.invalidItemId('The specified token is not allowed.'));
      }
    } else {
      const accessesRepository = storageLayer.accesses;
      params.token = accessesRepository.generateToken();
    }
    
    const expireAfter = params.expireAfter; 
    delete params.expireAfter;
    
    if (expireAfter != null) {
      if (expireAfter >= 0) 
        params.expires = timestamp.now() + expireAfter;
      else 
        return next(
          errors.invalidParametersFormat('expireAfter cannot be negative.'));
    }

    context.initTrackingProperties(params);
    
    return next();
  }

  // Creates default data structure from permissions if needed, for app
  // authorization. 
  // 
  function createDataStructureFromPermissions(context, params, result, next) {
    const access = context.access;
    if (access == null) 
      return next(errors.unexpectedError('AF: Access must not be null here.'));

    if (! access.isPersonal()) return next();
    if (params.permissions == null) return next(); 

    async.forEachSeries(params.permissions, ensureStream, next);

    function ensureStream(permission, streamCallback) {
      if (! permission.defaultName) return streamCallback();

      const streamsRepository = storageLayer.streams;
      const existingStream = treeUtils.findById(context.streams, permission.streamId);

      if (existingStream) {
        if (! existingStream.trashed) { return streamCallback(); }

        const update = {trashed: false};
        
        streamsRepository.updateOne(context.user, {id: existingStream.id}, update, function (err) {
          if (err) { return streamCallback(errors.unexpectedError(err)); }
          streamCallback();
        });
      } else {
        // create new stream
        const newStream = {
          id: permission.streamId,
          name: permission.defaultName,
          parentId: null
        };
        context.initTrackingProperties(newStream);
        
        streamsRepository.insertOne(context.user, newStream, function (err) {
          if (err) {
            if (Database.isDuplicateError(err)) {
              if (isDBDuplicateId(err)) {
                // stream already exists, log & proceed
                logger.info('accesses.create: stream "' + newStream.id + '" already exists: ' +
                    err.message);
              } else {
                // not OK: stream exists with same unique key but different id
                return streamCallback(errors.itemAlreadyExists(
                  'stream', {name: newStream.name}, err
                ));
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
    const accessesRepository = storageLayer.accesses;
    
    accessesRepository.insertOne(context.user, params, function (err, newAccess) {
      if (err) {
        if (Database.isDuplicateError(err)) {
          let conflictingKeys;
          if (isDBDuplicateToken(err)) {
            conflictingKeys = { token: '(hidden)' };
          } else {
            conflictingKeys = { 
              type: params.type, 
              name: params.name,
              deviceName: params.deviceName,
            };
          }
          return next(errors.itemAlreadyExists(
            'access', conflictingKeys
          ));
          
          // NOT REACHED
        } 
        
        return next(errors.unexpectedError(err));
      }

      result.access = newAccess;
      notifications.accessesChanged(context.username);
      next();
    });
  }


  // UPDATE

  api.register('accesses.update',
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(accessSchema('update'), updatesSettings.ignoreProtectedFields, logger),
    applyPrerequisitesForUpdate,
    checkAccessForUpdate,
    updateAccess);

  function applyPrerequisitesForUpdate(context, params, result, next) {
    context.updateTrackingProperties(params.update);
    next();
  }

  function checkAccessForUpdate(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;
    const currentAccess = context.access;
    
    if (currentAccess == null)
      return next(new Error('AF: access must not be null'));
      
    const update = params.update;

    // Deal with access expiry
    const expireAfter = update.expireAfter;
    delete update.expireAfter;
    
    if (expireAfter != null) {
      if (expireAfter >= 0)
        update.expires = timestamp.now() + expireAfter;
    }
    
    accessesRepository.findOne(context.user, {id: params.id}, dbFindOptions,
      function (err, access) {
        if (err) { return next(errors.unexpectedError(err)); }

        if (! access) {
          return next(errors.unknownResource(
            'access', params.id
          ));
        }
        
        // Check that the current access can be managed
        if(! currentAccess.canManageAccess(access)) {
          // NOTE If we throw a different error here, an attacker might 
          //  enumerate accesses that exist. Not being able to manage something
          //  (in the case of accesses) = not have the right to list. 
          return next(errors.unknownResource(
            'access', params.id));
        }
          
        // Check that the updated access can still be managed. In other words,
        // forbid any attempt to elevate the access permissions beyond
        // authorized level and context.
        
        // Here we foresee what the updated access would look like
        // in order to check if it is legit
        const updatedAccess = _.merge({}, access, params.update);
        if(! currentAccess.canManageAccess(updatedAccess)) {
          return next(errors.forbidden(
            'Your access token has insufficient permissions ' +
            'to perform this update.'
          ));
        }
        
        // NOTE We store the access loaded here for error reporting later. Don't 
        //  use this for more than that. 
        params.resource = access;
        
        next();
      });
  }

  // Updates the access in `params.id` with the attributes in `params.update`.
  // 
  function updateAccess(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;

    accessesRepository.updateOne(context.user, {id: params.id}, params.update,
      function (err, updatedAccess) {
        if (err != null) {
          if (Database.isDuplicateError(err)) {
            return next(errors.itemAlreadyExists('access',
              { type: params.resource.type, name: params.update.name }));
          }

          return next(errors.unexpectedError(err));
        }

        // cleanup internal fields
        delete updatedAccess.calls;

        // cleanup deleted
        delete updatedAccess.deleted;

        result.access = updatedAccess;
        notifications.accessesChanged(context.username);
        next();
      });
  }


  // DELETION

  api.register('accesses.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    checkAccessForDeletion,
    deleteAccess);

  function checkAccessForDeletion(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;
    const currentAccess = context.access;
    
    if (currentAccess == null)
      return next(new Error('AF: currentAccess cannot be null.'));

    accessesRepository.findOne(
      context.user,
      { id: params.id },
      dbFindOptions,
      function(err, access) {
        if (err != null) 
          return next(errors.unexpectedError(err));

        if (access == null)
          return next(errors.unknownResource('access', params.id));

        if (! currentAccess.canManageAccess(access)) {
          return next(
            errors.forbidden(
              'Your access token has insufficient permissions to ' +
              'delete this access.'
            )
          );
        }

        next();
      }
    );
  }

  function deleteAccess(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;

    accessesRepository.delete(context.user, {id: params.id}, function (err) {
      if (err) { return next(errors.unexpectedError(err)); }

      result.accessDeletion = {id: params.id};
      notifications.accessesChanged(context.username);
      next();
    });
  }


  // OTHER METHODS

  api.register('accesses.checkApp',
    commonFns.getParamsValidation(methodsSchema.checkApp.params),
    checkApp);

  function checkApp(context, params, result, next) {
    const currentAccess = context.access;
    if (currentAccess == null)
      return next(new Error('AF: currentAccess cannot be null.'));

    if (! currentAccess.isPersonal()) {
      return next(errors.forbidden(
        'Your access token has insufficient permissions to access this resource.'
      ));
    }

    const accessesRepository = storageLayer.accesses;
    const query = {
      type: 'app',
      name: params.requestingAppId,
      deviceName: params.deviceName || null
    };
    accessesRepository.findOne(context.user, query, dbFindOptions, function (err, access) {
      if (err != null) return next(errors.unexpectedError(err));

      // Do we have a match?
      if (accessMatches(access, params.requestedPermissions, params.clientData)) {
        result.matchingAccess = access;
        return next();
      } 
      
      // No, we don't have a match. Return other information:

      if (access != null) 
        result.mismatchingAccess = access;
      
      checkPermissions(context, params.requestedPermissions, function(
        err, checkedPermissions, checkError
      ) {
        if (err != null) 
          return next(err);

        result.checkedPermissions = checkedPermissions;
        if (checkError != null) {
          result.error = checkError;
        }
        next();
      });
    });
  }

  // Returns true if the given access' permissions match the `requestedPermissions`.
  // 
  function accessMatches(access: Access, requestedPermissions, clientData): boolean {
    if (access == null ||
        access.type !== 'app' ||
        access.permissions.length !== requestedPermissions.length) {
      return false;
    }
    
    // If the access is there but is expired, we consider it a mismatch. 
    if (isAccessExpired(access)) return false; 

    // Compare permissions
    let accessPerm, reqPerm;
    for (let i = 0, ni = access.permissions.length; i < ni; i++) {
      accessPerm = access.permissions[i];
      reqPerm = findByStreamId(requestedPermissions, accessPerm.streamId);

      if (! reqPerm ||
          reqPerm.level !== accessPerm.level) {
        return false;
      }
    }

    // Compare clientData
    if(! _.isEqual(access.clientData, clientData)) {
      return false;
    }

    return true;

    function findByStreamId(permissions, streamId) {
      return _.find(permissions, function (perm) { return perm.streamId === streamId; });
    }
  }

  // Iterates over the given permissions, replacing `defaultName` properties
  // with the actual `name` of existing streams. When defined, the callback's
  // `checkError` param signals issues with the requested permissions.
  // 
  function checkPermissions(context, permissions, callback) {
    // modify permissions in-place, assume no side fx
    const checkedPermissions = permissions; 
    let checkError = null;
    
    async.forEachSeries(checkedPermissions, checkPermission, function(err) {
      if (err != null) {
        return err instanceof APIError
          ? callback(err)
          : callback(errors.unexpectedError(err));
      }
      
      callback(null, checkedPermissions, checkError);
    });
    return;
    
    // NOT REACHED

    function checkPermission(permission, done) {
      if (permission.streamId === '*') {
        // cleanup ignored properties just in case
        delete permission.defaultName;
        return done();
      }

      if (permission.defaultName == null) {
        return done(
          errors.invalidParametersFormat(
            "The parameters' format is invalid.",
            'The permission for stream "' +
              permission.streamId +
              '" (and maybe others) is ' +
              'missing the required "defaultName".'
          )
        );
      }

      let permissionStream;
      const streamsRepository = storageLayer.streams;
      
      async.series(
        [
          function checkId(stepDone) {
            // NOT-OPTIMIZED: could return only necessary fields
            streamsRepository.findOne(
              context.user,
              { id: permission.streamId },
              null,
              function(err, stream) {
                if (err != null) 
                  return stepDone(err);

                permissionStream = stream;
                if (permissionStream != null) {
                  permission.name = permissionStream.name;
                  delete permission.defaultName;
                }

                stepDone();
              }
            );
          },
          function checkSimilar(stepDone) {
            if (permissionStream != null) 
              return stepDone();

            let nameIsUnique = false;
            let curSuffixNum = 0;
            
            async.until(
              () => nameIsUnique,
              checkName,
              stepDone
            );

            // Checks if a stream with a name of `defaultName` combined with 
            // `curSuffixNum` exists. Sets `nameIsUnique` to true if not. 
            function checkName(checkDone) {
              const checkedName = getAlternativeName(
                permission.defaultName,
                curSuffixNum
              );
              streamsRepository.findOne(
                context.user,
                { name: checkedName, parentId: null },
                null,
                function(err, stream) {
                  if (err != null)
                    return checkDone(err);
                    
                  // Is the name still free?
                  if (stream == null) {
                    nameIsUnique = true;
                    permission.defaultName = checkedName;
                  } else {
                    curSuffixNum++;
                    checkError = produceCheckError();
                  }

                  checkDone();
                }
              );
            }
          },
        ],
        done
      );
    }

    function produceCheckError() {
      return {
        id: ErrorIds.ItemAlreadyExists,
        message:
          'One or more requested streams have the same names as existing streams ' +
          'with different ids. The "defaultName" of the streams concerned have been updated ' +
          'with valid alternative proposals.',
      };
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
      if (suffixNum === 0) return name; 
      
      return `${name} (${suffixNum})`;
    }
  }

  // Centralises the check for access expiry; yes, this should be part of some
  // business model about accesses. There is one more such check in MethodContext, 
  // called `checkAccessValid`.
  //
  function isAccessExpired(access: Access, nowParam?: number): boolean {
    const now = nowParam || timestamp.now(); 
    return access.expires != null && now > access.expires;
  }

};
module.exports.injectDependencies = true;
