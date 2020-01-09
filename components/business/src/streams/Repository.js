// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const Stream = require('./Stream');
const StreamsStorage = require('components/storage').StorageLayer.streams;
const UsersStorage = require('components/storage').StorageLayer.users;

import type { User } from 'components/business/src/users';

/**
 * Repository of all Streams in this Pryv.io instance.
 */
class Repository {
  storage: StreamsStorage;
  usersStorage: UsersStorage;

  constructor(streamsStorage: StreamsStorage, usersStorage: UsersStorage) {
    this.storage = streamsStorage;
    this.usersStorage = usersStorage;
  }

  /**
   * Returns all streams
   */
  async getAll(user: User): Promise<Array<Stream>> {
    const streamsQuery = {};
    const streamsOptions = {};

    let streams = await bluebird.fromCallback(cb =>
      this.storage.find(user, streamsQuery, streamsOptions, cb)
    );
    streams = streams.map(s => {
      return initStream(user, this, s);
    });
    return streams;
  }

  /**
   * Inserts a stream for a user
   */
  async insertOne(user: User, stream: Stream): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.insertOne(user, stream.forStorage(), cb)
    );
  }

  /**
   * Updates certain fields of a stream for a user
   */
  async updateOne(user: User, update: {}, streamId: string): Promise<void> {
    const query = { id: streamId };
    await bluebird.fromCallback(cb =>
      this.storage.updateOne(user, query, update, cb)
    );
  }

  /**
   * Deletes a stream for a user, given the stream's id
   */
  async deleteOne(user: User, streamId: string): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.delete(user, { id: streamId }, cb)
    );
  }

  /**
   * Deletes all streams for a user.
   */
  async deleteForUser(user: User): Promise<void> {
    await bluebird.fromCallback(cb => this.storage.delete(user, {}, cb));
  }
}
module.exports = Repository;

function initStream(user: User, repository: Repository, stream: {}): Stream {
  return new Stream(
    _.merge(
      {
        streamsRepository: repository,
        user: user
      },
      stream
    )
  );
}
