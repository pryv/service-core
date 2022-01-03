/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const async = require('async');
const slugify = require('slug');
const _ = require('lodash');
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const APIError = require('errors').APIError;
const errors = require('errors').factory;
const ErrorIds = require('errors').ErrorIds;
const ErrorMessages = require('errors').ErrorMessages;

const { ApiEndpoint , treeUtils } = require('utils');

const commonFns = require('./helpers/commonFunctions');
const methodsSchema = require('../schema/accessesMethods');
const accessSchema = require('../schema/access');
const string = require('./helpers/string');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const cache = require('cache');

const { getLogger, getConfig } = require('@pryv/boiler');
const { getMall } = require('mall');
const { pubsub } = require('messages');
const { getStorageLayer } = require('storage');

const { changeStreamIdsInPermissions } = require('./helpers/backwardCompatibility');

const { integrity } = require('business');

import type { StorageLayer } from 'storage';
import type { MethodContext } from 'business';

import type API  from '../API';
import type { ApiCallback }  from '../API';
import type Result  from '../Result';

type Permission = {
  streamId: string, 
  level: 'manage' | 'contribute' | 'read' | 'create-only' | 'none',
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

module.exports = async function produceAccessesApiMethods(api: API)
{
  const config = await getConfig();
  const logger = getLogger('methods:accesses');
  const isOpenSource = config.get('openSource:isActive');
  const dbFindOptions = { projection: 
    { calls: 0, deleted: 0 } };
  const mall = await getMall();
  const storageLayer = await getStorageLayer();
  const updatesSettings: UpdatesSettingsHolder = {
    ignoreProtectedFields: config.get('updates:ignoreProtectedFields'),
  }

  const isStreamIdPrefixBackwardCompatibilityActive: boolean = config.get('backwardCompatibility:systemStreams:prefix:isActive');

  // RETRIEVAL
  api.register('accesses.get',
    commonFns.basicAccessAuthorizationCheck,
    commonFns.getParamsValidation(methodsSchema.get.params),
    findAccessibleAccesses,
    includeDeletionsIfRequested
  );

  async function findAccessibleAccesses(context, params, result, next) {
    const currentAccess: Access = context.access;
    const accessesRepository = storageLayer.accesses;
    const query = {};
    
    if (currentAccess == null) 
      return next(new Error('AF: Access cannot be null at this point.'));
    
    if (! currentAccess.canListAnyAccess()) {
      // app -> only access it created
      query.createdBy = currentAccess.id;
    }

    try {
      let accesses: Array<Access> = await bluebird.fromCallback(cb => accessesRepository.find(context.user, query, dbFindOptions, cb));

      if (excludeExpired(params)) {
        accesses = accesses.filter(a => ! isAccessExpired(a));
      }

      // Add apiEndpoind
      for (let i = 0; i < accesses.length; i++) {
        if (accesses[i].permissions != null) { // assert is personal access
          if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
            accesses[i].permissions = changeStreamIdsInPermissions(accesses[i].permissions);  
          }
        }
        accesses[i].apiEndpoint = ApiEndpoint.build(context.user.username, accesses[i].token); 
      }

      result.accesses = accesses;

      next();
    } catch (err) {
      return next(errors.unexpectedError(err)); 
    }

    function excludeExpired(params: mixed): boolean {
      return ! params.includeExpired;
    }
  }

  async function includeDeletionsIfRequested(context, params, result, next) {
    if (params.includeDeletions == null) { return next(); }

    const currentAccess: Access = context.access;
    const accessesRepository = storageLayer.accesses;

    const query = {};
    if (!currentAccess.canListAnyAccess()) {
      // app -> only access it created
      query.createdBy = currentAccess.id;
    }

    try {
      const deletions: Array<Access> = await bluebird.fromCallback(cb => accessesRepository.findDeletions(context.user, query,  { projection: { calls: 0 } }, cb));

      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        for (let access of deletions) {
          if (access.permissions == null) continue;
          access.permissions = changeStreamIdsInPermissions(access.permissions);
        }
      }
      result.accessDeletions = deletions;

      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }


  // CREATION

  const notVisibleAccountStreamsIds = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading();
  const visibleAccountStreamsIds = SystemStreamsSerializer.getReadableAccountStreamIds();

  api.register('accesses.create',
    commonFns.basicAccessAuthorizationCheck,
    applyDefaultsForCreation,
    commonFns.getParamsValidation(methodsSchema.create.params),
    applyPrerequisitesForCreation,
    applyAccountStreamsValidation,
    createDataStructureFromPermissions,
    cleanupPermissions,
    createAccess, 
    addIntegrityToContext);

  function applyDefaultsForCreation(context, params, result, next) {
    _.defaults(params, {type: 'shared'});
    next();
  }

  async function applyPrerequisitesForCreation(context, params, result, next) {
    if (params.type === 'personal') {
      return next(errors.forbidden(
        'Personal accesses are created automatically on login.'
      ));
    }

    if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
      params.permissions = changeStreamIdsInPermissions(params.permissions, false);
    }

    const permissions = params.permissions;
    for (const permission of permissions) {
      if (permission.streamId != null) {
        try {
          commonFns.isValidStreamIdForQuery(permission.streamId, permission, 'permissions');
        } catch (err) {
          return next(errors.invalidRequestStructure(err.message, params.permissions));
        }
      } 
    }
    
    const access = context.access;
      
    if (! await access.canCreateAccess(params)) {
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

  /**
   * If user is creating an access for system streams, apply some validations
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  function applyAccountStreamsValidation (context, params, result, next) {
    if (params.permissions == null) return next();
    
    for (const permission of params.permissions) {
      if (isStreamBasedPermission(permission)) {
        if (isUnknownSystemStream(permission.streamId)) {
          return next(errors.forbidden('Forbidden'))
        }
        // don't allow user to give access to not visible stream
        if (notVisibleAccountStreamsIds.includes(permission.streamId)) {
          return next(errors.invalidOperation(
            ErrorMessages[ErrorIds.DeniedStreamAccess],
            { param: permission.streamId }
          ));
        }
        // don't allow user to give anything higher than contribute or read access
        // to visible stream
        if (visibleAccountStreamsIds.includes(permission.streamId) && 
        !context.access.canCreateAccessForAccountStream(permission.level)) {
          return next(errors.invalidOperation(
            ErrorMessages[ErrorIds.TooHighAccessForSystemStreams],
            { param: permission.streamId }));
        }
      }
    }

    function isStreamBasedPermission(permission): boolean {
      return permission.streamId != null;
    }

    function isUnknownSystemStream(streamId: string): boolean {
      return SystemStreamsSerializer.hasSystemStreamPrefix(streamId) && (SystemStreamsSerializer.removePrefixFromStreamId(streamId) === streamId);
    }

    return next();
  }

  // Creates default data structure from permissions if needed, for app
  // authorization. 
  // 
  async function createDataStructureFromPermissions(context, params, result, next) {
    const access = context.access;

    if (! access.isPersonal()) return next(); // not needed for personal access

    for (const permission of params.permissions) {
      try {
        await ensureStream(permission);
      } catch (e) {
        return next(e);
      }
    }
    return next();

    async function ensureStream (permission) {
      // We ensure stream Exists only if streamid is != '*' and if a defaultName is providedd
      if (permission.streamId == null || permission.streamId === '*' || permission.defaultName == null) return ;


      const streamsRepository = storageLayer.streams;
  
      const existingStream = await context.streamForStreamId(permission.streamId);

      if (existingStream != null) {
        if (! existingStream.trashed) return ; 

        // untrash stream
        const update = {trashed: false};
        try { 
          await bluebird.fromCallback(cb =>  streamsRepository.updateOne(context.user, {id: existingStream.id}, update, cb));
        } catch (err) {
          throw(errors.unexpectedError(err));
        }
        return ;
      }

      if (! commonFns.isValidStreamIdForCreation(permission.streamId)) {
        return next(errors.invalidRequestStructure(`Error while creating stream for access. Invalid 'permission' parameter, forbidden chartacter(s) in streamId '${permission.streamId}'. StreamId should be of length 1 to 100 chars, with lowercase letters, numbers or dashes.`, permission));
      }

      // create new stream
      const newStream = {
        id: permission.streamId,
        name: permission.defaultName,
        parentId: null
      };
      context.initTrackingProperties(newStream);
      
      try {
        await bluebird.fromCallback(cb =>  streamsRepository.insertOne(context.user, newStream, cb));
      } catch (err) {
          // Duplicate errors
          if (err.isDuplicateIndex('id')) {
            // Stream already exists, log & proceed
            logger.info('accesses.create: stream "' + newStream.id + '" already exists: ' + err.message);
          }
          else if (err.isDuplicateIndex('name')) {
            // Not OK: stream exists with same unique key but different id
            throw(errors.itemAlreadyExists('stream', {name: newStream.name}, err));
          } else {
            // Any other error
            throw(errors.unexpectedError(err));
          }
      }
    }
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
      if (err != null) {
        // Duplicate errors
        if (err.isDuplicateIndex('token')) {
          return next(errors.itemAlreadyExists('access', { token: '(hidden)' }));
        }
        if (err.isDuplicateIndex('type') && err.isDuplicateIndex('name') && err.isDuplicateIndex('deviceName')) {
          return next(errors.itemAlreadyExists('access', { 
            type: params.type,
            name: params.name,
            deviceName: params.deviceName,
          }));
        }
        // Any other error
        return next(errors.unexpectedError(err));
      }

      result.access = newAccess;
      result.access.apiEndpoint = ApiEndpoint.build(context.user.username, result.access.token);
      
      pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_ACCESSES_CHANGED);
      next();
    });
  }


  // UPDATE

  api.register('accesses.update',
    goneResource);

  function goneResource(context, params, result, next) {
    next(errors.goneResource('accesses.update has been removed'));
  }

  // DELETION

  api.register('accesses.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    checkAccessForDeletion,
    findRelatedAccesses,
    deleteAccesses);

  async function checkAccessForDeletion(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;
    const currentAccess = context.access;
    
    if (currentAccess == null)
      return next(new Error('AF: currentAccess cannot be null.'));

    let access;
    try {
      access = await bluebird.fromCallback(cb => {
        accessesRepository.findOne(
          context.user,
          { id: params.id },
          dbFindOptions,
          cb);
      });
    } catch (err) {
      return next(errors.unexpectedError(err));
    }

    if (access == null)
      return next(errors.unknownResource('access', params.id));
          
      if (! await currentAccess.canDeleteAccess(access)) {
        return next(
          errors.forbidden(
            'Your access token has insufficient permissions to ' +
            'delete this access.'
          )
        );
      }
  
      // used in next function
      params.accessToDelete = access;
      next();
  }

  async function findRelatedAccesses(context, params, result, next) {
    const accessToDelete = params.accessToDelete;
    const accessesRepository = storageLayer.accesses;
    
    // deleting a personal access does not delete the accesses it created.
    if (! accessToDelete.type === 'personal') {
      return next();
    }

    let accesses;
    try {
      accesses = await bluebird.fromCallback(cb => {
        accessesRepository.find(context.user, { createdBy: params.id}, dbFindOptions, cb);
      });
    } catch (err) {
      return next(errors.unexpectedError(err)); 
    }
    if (accesses.length === 0) return next();

    accesses = accesses.filter(a => a.id !== params.id);
    accesses = accesses.filter(a => ! isAccessExpired(a));
    accesses = accesses.map(a => {
      return { id: a.id }
    });
    result.relatedDeletions = accesses;

    next();
  }

  async function deleteAccesses(context, params, result, next) {
    const accessesRepository = storageLayer.accesses;

    let idsToDelete: Array<{id: string}> = [{ id: params.id }];
    if (result.relatedDeletions != null) {
      idsToDelete = idsToDelete.concat(result.relatedDeletions);
    }

    // remove from cache
    for (const idToDelete of idsToDelete) {
      const accessToDelete = cache.getAccessLogicForId(context.user.id, idToDelete.id);
      if (accessToDelete != null) {
        cache.unsetAccessLogic(context.user.id, accessToDelete);
     }
    }

    try {
      await bluebird.fromCallback(cb => {
        accessesRepository.delete(context.user,
          { $or: idsToDelete },
          cb);
      });
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
    result.accessDeletion = {id: params.id};
    pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_ACCESSES_CHANGED);
    next();
  }

  // OTHER METHODS

  api.register('accesses.checkApp',
    commonFns.basicAccessAuthorizationCheck,
    commonFns.getParamsValidation(methodsSchema.checkApp.params),
    checkApp);

  function checkApp(context, params, result, next) {
   
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


  function addIntegrityToContext(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(result?.access?.integrity != null ) {
      context.auditIntegrityPayload = {
        key: integrity.accesses.key(result.access),
        integrity: result.access.integrity,
      };
     
      if (process.env.NODE_ENV === 'test' && ! isOpenSource && integrity.accesses.isActive) {
        // double check integrity when running tests only
        if (result.access.integrity != integrity.accesses.hash(result.access)) {
          return next(new Error('integrity mismatch ' + JSON.stringify(result.access)));
        }
      }
    }
    next();
  }

};
