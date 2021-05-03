/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const UsersRepository = require('business/src/users/repository');
const { getServiceRegisterConn } = require('business/src/auth/service_register');
const errors = require('errors').factory;

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';




const { getLogger } = require('@pryv/boiler');

const { setAuditAccessId, AuditAccessIds } = require('audit/src/MethodContextUtils');

const setAdminAuditAccessId = setAuditAccessId(AuditAccessIds.ADMIN_TOKEN);
class Deletion {
  logger: any;
  storageLayer: any;
  config: any;
  usersRepository: UsersRepository;
  serviceRegisterConn: ServiceRegister;

  constructor(logging: any, storageLayer: any, config: any) {
    this.logger = getLogger('business:deletion');
    this.storageLayer = storageLayer;
    this.config = config;
    this.usersRepository = new UsersRepository(this.storageLayer.events);
    this.serviceRegisterConn = getServiceRegisterConn();
  }

  

  /**
   * Authorization check order: 
   * 1- is a valid admin token
   * 2- is a valid personalToken
   */
  checkIfAuthorized(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const canDelete = this.config.get('user-account:delete');
    if (canDelete.includes('adminToken')) {
      if(this.config.get('auth:adminAccessKey') === context.authorizationHeader) {
        return setAdminAuditAccessId(context, params, result, next);
      }
    }
   
    if (canDelete.includes('personalToken')) {
      if(context.access && context.access.isPersonal && context.access.isPersonal()) {
        return next();
      } 
      // If personal Token is available, then error code is different
      return next(errors.invalidAccessToken('Cannot find access from token.', 403));
    } 
    return next(errors.unknownResource());
  }

  async validateUserExists(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const user = await this.usersRepository.getAccountByUsername(params.username);
    if (!user || !user.id) {
      return next(errors.unknownResource('user', params.username));
    }
    context.user = user;
    next();
  }

  async validateUserFilepaths(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [
      this.config.get('eventFiles:attachmentsDirPath'),
      this.config.get('eventFiles:previewsDirPath'),
    ];

    // NOTE User specific paths are constructed by appending the user _id_ to the
    // `paths` constant above. I know this because I read EventFiles#getXPath(...)
    // in components/storage/src/user/EventFiles.js.

    // NOTE Since user specific paths are created lazily, we should not expect
    //  them to be there. But _if_ they are, they need be accessible.

    // Let's check if we can change into and write into the user's paths:
    const inaccessibleDirectory = findNotAccessibleDir(
      paths.map((p) => path.join(p, context.user.id))
    );
    if (inaccessibleDirectory) {
      const error = new Error(
        `Directory '${inaccessibleDirectory}' is inaccessible or missing.`
      );
      this.logger.error(error, error);
      return next(errors.unexpectedError(error));
    }
    next();
  }

  async deleteUserFiles(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [
      this.config.get('eventFiles:attachmentsDirPath'),
      this.config.get('eventFiles:previewsDirPath'),
    ];

    const userPaths = paths.map((p) => path.join(p, context.user.id));
    const opts = {
      disableGlob: true,
    };

    await bluebird.map(userPaths, (path) =>
      bluebird.fromCallback((cb) => rimraf(path, opts, cb))
    );

    next();
  }

  async deleteHFData (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    if (this.config.get('openSource:isActive')) return next();
    // dynamic loading , because series functionality does not exist in opensource
    const InfluxConnection = require('business/src/series/influx_connection');
    const host = this.config.get('influxdb:host');
    const port = this.config.get('influxdb:port');

    const influx = new InfluxConnection({ host: host, port: port });
    await influx.dropDatabase(`user.${params.username}`);
    next();
  }

  async deleteAuditData (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    if (this.config.get('openSource:isActive')) return next();
    // dynamic loading , because series functionality does not exist in opensource
    const pathForuserId = require('business/src/users/UserLocalDirectory').pathForuserId;
    const auditFolder = pathForuserId(context.user.id);
    fs.unlinkSync(auditFolder);
    next();
  }

  async deleteUser(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const dbCollections = [
        this.storageLayer.accesses,
        this.storageLayer.events,
        this.storageLayer.streams,
        this.storageLayer.followedSlices,
        this.storageLayer.profile,
        this.storageLayer.webhooks,
      ];

      const drops = dbCollections
        .map((coll) =>
          bluebird.fromCallback((cb) => coll.dropCollection(context.user, cb))
        )
        .map((promise) =>
          promise.catch(
            (e) => /ns not found/.test(e.message),
            () => {}
          )
        );

      await this.usersRepository.deleteOne(context.user.id);

      await Promise.all(drops);

      await bluebird.fromCallback((cb) =>
        this.storageLayer.sessions.remove(
          { 'data.username': { $eq: context.user.username } },
          cb
        )
      );
    } catch (error) {
      this.logger.error(error, error);
      return next(errors.unexpectedError(error));
    }
    result.userDeletion = { username: context.user.username };
    next();
  }

  async deleteOnRegister(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    if (this.config.get('openSource:isActive') || this.config.get('dnsLess:isActive')) return next();
    try {
      const res = await this.serviceRegisterConn.deleteUser(params.username);
      this.logger.debug('on register: ' + params.username, res);
    } catch (e) { // user might have been deleted register we do not FW error just log it
      this.logger.error(e, e);
    }
    next();
  };
}

function findNotExistingDir(paths: Array<string>): string {
  let notExistingDir = '';
  for (let path of paths) {
    if (!fs.existsSync(path)) {
      notExistingDir = path;
      break;
    }
  }
  return notExistingDir;
}

function findNotAccessibleDir(paths: Array<string>): string {
  let notAccessibleDir = '';
  for (let path of paths) {
    let stat;
    try {
      stat = fs.statSync(path);

      if (!stat.isDirectory()) {
        throw new Error();
      }

      fs.accessSync(path, fs.constants.W_OK + fs.constants.X_OK);
    } catch (err) {
      if (err.code === 'ENOENT') { // ignore if file does not exist
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
