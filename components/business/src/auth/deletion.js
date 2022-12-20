/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const { getUsersRepository } = require('business/src/users');
const errors = require('errors').factory;
const { getLogger } = require('@pryv/boiler');
const { setAuditAccessId, AuditAccessIds } = require('audit/src/MethodContextUtils');
const setAdminAuditAccessId = setAuditAccessId(AuditAccessIds.ADMIN_TOKEN);

class Deletion {
  logger;

  storageLayer;

  config;
  constructor (logging, storageLayer, config) {
    this.logger = getLogger('business:deletion');
    this.storageLayer = storageLayer;
    this.config = config;
  }

  /**
   * Authorization check order:
   * 1- is a valid admin token
   * 2- is a valid personalToken
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {any}
   */
  checkIfAuthorized (context, params, result, next) {
    const canDelete = this.config.get('user-account:delete');
    if (canDelete.includes('adminToken')) {
      if (this.config.get('auth:adminAccessKey') === context.authorizationHeader) {
        return setAdminAuditAccessId(context, params, result, next);
      }
    }
    if (canDelete.includes('personalToken')) {
      if (context.access &&
                context.access.isPersonal &&
                context.access.isPersonal()) {
        return next();
      }
      // If personal Token is available, then error code is different
      return next(errors.invalidAccessToken('Cannot find access from token.', 403));
    }
    return next(errors.unknownResource());
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<any>}
   */
  async validateUserExists (context, params, result, next) {
    const usersRepository = await getUsersRepository();
    const user = await usersRepository.getUserByUsername(params.username);
    if (!user || !user.id) {
      return next(errors.unknownResource('user', params.username));
    }
    context.user = { id: user.id };
    context.user.username = user.username;
    next();
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<any>}
   */
  async validateUserFilepaths (context, params, result, next) {
    const paths = [
      this.config.get('eventFiles:attachmentsDirPath'),
      this.config.get('eventFiles:previewsDirPath')
    ];
    // NOTE User specific paths are constructed by appending the user _id_ to the
    // `paths` constant above. I know this because I read EventFiles#getXPath(...)
    // in components/storage/src/user/EventFiles.js.
    // NOTE Since user specific paths are created lazily, we should not expect
    //  them to be there. But _if_ they are, they need be accessible.
    // Let's check if we can change into and write into the user's paths:
    const inaccessibleDirectory = findNotAccessibleDir(paths.map((p) => path.join(p, context.user.id)));
    if (inaccessibleDirectory) {
      const error = new Error(`Directory '${inaccessibleDirectory}' is inaccessible or missing.`);
      this.logger.error(error, error);
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<void>}
   */
  async deleteUserFiles (context, params, result, next) {
    const paths = [
      this.config.get('eventFiles:attachmentsDirPath'),
      this.config.get('eventFiles:previewsDirPath')
    ];
    const userPaths = paths.map((p) => path.join(p, context.user.id));
    const opts = {
      disableGlob: true
    };
    await bluebird.map(userPaths, (path) => bluebird.fromCallback((cb) => rimraf(path, opts, cb)));
    next();
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<any>}
   */
  async deleteHFData (context, params, result, next) {
    if (this.config.get('openSource:isActive')) { return next(); }
    // dynamic loading , because series functionality does not exist in opensource
    const InfluxConnection = require('business/src/series/influx_connection');
    const host = this.config.get('influxdb:host');
    const port = this.config.get('influxdb:port');
    const influx = new InfluxConnection({ host, port });
    await influx.dropDatabase(`user.${params.username}`);
    next();
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<any>}
   */
  async deleteAuditData (context, params, result, next) {
    if (this.config.get('openSource:isActive')) { return next(); }
    // dynamic loading , because series functionality does not exist in opensource
    const deleteUserDirectory = require('storage').userLocalDirectory.deleteUserDirectory;
    await deleteUserDirectory(context.user.id);
    next();
  }

  /**
   * @param {MethodContext} context
   * @param {unknown} params
   * @param {Result} result
   * @param {ApiCallback} next
   * @returns {Promise<any>}
   */
  async deleteUser (context, params, result, next) {
    try {
      const dbCollections = [
        this.storageLayer.accesses,
        this.storageLayer.followedSlices,
        this.storageLayer.profile,
        this.storageLayer.webhooks
      ];
      const drops = dbCollections
        .map((coll) => bluebird.fromCallback((cb) => coll.dropCollection(context.user, cb)))
        .map((promise) => promise.catch((e) => /ns not found/.test(e.message), () => { }));
      const usersRepository = await getUsersRepository();
      await usersRepository.deleteOne(context.user.id, context.user.username);
      await Promise.all(drops);
      await bluebird.fromCallback((cb) => this.storageLayer.sessions.remove({ 'data.username': { $eq: context.user.username } }, cb));
    } catch (error) {
      this.logger.error(error, error);
      return next(errors.unexpectedError(error));
    }
    result.userDeletion = { username: context.user.username };
    next();
  }
}

/**
 * @param {Array<string>} paths
 * @returns {string}
 */
function findNotAccessibleDir (paths) {
  let notAccessibleDir = '';
  for (const path of paths) {
    let stat;
    try {
      stat = fs.statSync(path);
      if (!stat.isDirectory()) {
        throw new Error();
      }
      fs.accessSync(path, fs.constants.W_OK + fs.constants.X_OK);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // ignore if file does not exist
        continue;
      } else {
        notAccessibleDir = path;
        break;
      }
    }
  }
  return notAccessibleDir;
}
module.exports = Deletion;
