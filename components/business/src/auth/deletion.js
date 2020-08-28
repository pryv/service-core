/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const UserRepository = require('components/business/src/users/repository');
const errors = require('components/errors').factory;
const rimraf = require('rimraf');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const business = require('components/business');

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

class Deletion {
  logger: any;
  storageLayer: any;
  settings: any;
  defaultStreamsSerializer: SystemStreamsSerializer = new SystemStreamsSerializer();
  userRepository: UserRepository;
  accountStreamsSettings: any = this.defaultStreamsSerializer.getFlatAccountStreamSettings();

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
    const user = await this.userRepository.getById(params.id);
    if (user === null) {
      return next(errors.unknownResource('user', params.id));
    }
    next();
  }

  async validateUserFilepaths(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [this.settings.get('eventFiles.attachmentsDirPath').str(), this.settings.get('eventFiles.previewsDirPath').str()]; 

    const missingBaseDirectory = firstThrow(paths, path => fs.statSync(path));
    if (missingBaseDirectory != null) {
      return next(errors.unexpectedError(new Error(`Base directory '${missingBaseDirectory}' doesn't seem to exist.`)));
    }

    // NOTE User specific paths are constructed by appending the user _id_ to the
    // `paths` constant above. I know this because I read EventFiles#getXPath(...)
    // in components/storage/src/user/EventFiles.js.

    // NOTE Since user specific paths are created lazily, we should not expect 
    //  them to be there. But _if_ they are, they need be accessible. 

    const user = await this.userRepository.getById(params.id);
    if (!user || !user.userId) {
      return next(errors.unknownResource('user', params.id));
    }

    // Let's check if we can change into and write into the user's paths: 
    const inaccessibleDirectory = firstThrow(
      paths.map(p => path.join(p, user.userId)),
      userPath => {
        let stat; 
        try {
          stat = fs.statSync(userPath); // throws if userPath doesn't exist
        }
        catch (err) {
          // We accept that the user specific directory may be missing from the
          // disk, see above. 
          if (err.code === 'ENOENT') 
            return; 
          else
            throw err; 
        }

        if (!stat.isDirectory())
          throw new Error(`Path '${userPath}' exists, but is not a directory.`);

        fs.accessSync(userPath, fs.constants.W_OK + fs.constants.X_OK);
      });

    if (inaccessibleDirectory != null) {
      return next(errors.unexpectedError(new Error(`Directory '${inaccessibleDirectory}' is inaccessible or missing.`)));
    }
    next();
  }

  async deleteHFData(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const influx = new business.series.InfluxConnection(
      {host: 'localhost'}, this.logger); 

    await influx.dropDatabase(
      `user.${params.id}`);

    next();
  } 

  async deleteUserFiles(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    const paths = [this.settings.get('eventFiles.attachmentsDirPath').str(), this.settings.get('eventFiles.previewsDirPath').str()]; 

    const user = await this.userRepository.getById(params.id);
    if (!user || !user.userId) {
      return next(errors.unknownResource('user', params.id));
    }

    const userPaths =  paths.map(p => path.join(p, user.userId));
    const opts = {
      disableGlob: true, 
    };

    await bluebird.map(userPaths, 
      path => bluebird.fromCallback(cb => rimraf(path, opts, cb)));

    next();
  }

  async deleteUser(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const user = await this.userRepository.getById(params.id);
      if (user == null) {
        return next(errors.unknownResource('user', params.id));
      }

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
          bluebird.fromCallback((cb) => coll.dropCollection(user, cb))
        )
        .map((promise) =>
          promise.catch(
            (e) => /ns not found/.test(e.message),
            () => {}
          )
        );

      await Promise.all(drops);

      await this.userRepository.deleteOne(user.userId);

      await bluebird.fromCallback((cb) =>
        this.storageLayer.sessions.remove(
          { data: { username: user.username } },
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

function firstThrow<T>(collection: Array<T>, fun: (T) => mixed): ?T {
  for (const el of collection) {
    try {
      fun(el);
    }
    catch (err) {
      return el; 
    }
  }
  return null; 
}

module.exports = Deletion;
