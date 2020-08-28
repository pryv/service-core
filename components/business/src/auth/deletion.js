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

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

class Deletion {
  logger: any;
  storageLayer: any;
  defaultStreamsSerializer: SystemStreamsSerializer = new SystemStreamsSerializer();
  userRepository: UserRepository;
  accountStreamsSettings: any = this.defaultStreamsSerializer.getFlatAccountStreamSettings();

  constructor(logging: any, storageLayer: any) {
    this.logger = logging.getLogger('business/deletion');
    this.storageLayer = storageLayer;
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

  async deleteUser(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const user = await this.userRepository.getById(params.id);
      if (user == null) 
        throw new Error('AF: User must exist');

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

module.exports = Deletion;
