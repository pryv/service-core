/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const InfluxConnection = require('components/business/src/series/influx_connection');
const UserRepository = require('components/business/src/users/repository');
const errors = require('components/errors').factory;

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

class Deletion {
  logger: any;
  storageLayer: any;
  settings: any;
  userRepository: UserRepository;

  constructor(logging: any, storageLayer: any, settings: any) {
    this.logger = logging.getLogger('business/deletion');
    this.storageLayer = storageLayer;
    this.settings = settings;
    this.userRepository = new UserRepository(this.storageLayer.events);
  }

  async validateUserExists(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const user = await this.userRepository.getById(params.username);
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
      this.settings.get('eventFiles.attachmentsDirPath').str(),
      this.settings.get('eventFiles.previewsDirPath').str(),
    ];

    const notExistingDir = findNotExistingDir(paths);
    if (notExistingDir) {
      const error = new Error(`Base directory '${notExistingDir}' does not exist.`);
      this.logger.error(error);
      return next(
        errors.unexpectedError(error)
      );
    }

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
      this.logger.error(error);
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
      this.settings.get('eventFiles.attachmentsDirPath').str(),
      this.settings.get('eventFiles.previewsDirPath').str(),
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

  async deleteHFData(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const host = this.settings.get('influxdb.host').str(); 
    const port = this.settings.get('influxdb.port').num();

    const influx = new InfluxConnection(
      {host: host, port: port},
      this.logger
    );

    await influx.dropDatabase(`user.${params.username}`);

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

      await this.userRepository.deleteOne(context.user.id);

      await Promise.all(drops);

      await bluebird.fromCallback((cb) =>
        this.storageLayer.sessions.remove(
          { data: { username: context.user.username } },
          cb
        )
      );
    } catch (error) {
      this.logger.error(error);
      return next(errors.unexpectedError(error));
    }
    next();
  }
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
      if (err.code === 'ENOENT') {
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
