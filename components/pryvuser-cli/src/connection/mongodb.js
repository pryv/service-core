// @flow

import type { MongoDbSettings } from '../configuration';

const assert = require('assert');
const bluebird = require('bluebird');
const lodash = require('lodash');

const { Database, StorageLayer } = require('components/storage');
const { NullLogger } = require('components/utils/src/logging');

class MongoDB {
  database: *;

  storageLayer: *;

  constructor(config: MongoDbSettings) {
    const nullLogger = new NullLogger();
    const fsSettings = config.fileStore;

    // This is just a large number that we use here to replace the several
    // settings of 'type' 'maxAgeSomething'. We don't want to trigger max
    // age actions, just delete a user (currently).
    const manySeconds = 1000 * 3600 * 1000;

    const databaseConfig: Object = lodash.clone(config);

    delete databaseConfig.dbname;
    databaseConfig.name = config.dbname;

    this.database = new Database(databaseConfig, nullLogger);

    this.storageLayer = new StorageLayer(
      this.database, nullLogger,
      fsSettings.attachmentsPath, fsSettings.previewsPath,
      manySeconds, manySeconds,
    );
  }

  async preflight(username: string): Promise<void> {
    const user = await this.findUser(username);

    if (user == null) throw new Error(`No such user ('${username}')`);

    assert(user.passwordHash.length > 0);
  }

  async deleteUser(username: string): Promise<void> {
    const storage = this.storageLayer;

    const user = await this.findUser(username);
    if (user == null) { throw new Error('AF: User must exist'); }

    // assert: user != null

    // Drop all the users collections:
    const dbCollections = [
      storage.accesses,
      storage.events,
      storage.streams,
      storage.followedSlices,
      storage.profile,
      storage.webhooks,
    ];

    const drops = dbCollections
      .map((coll) => bluebird.fromCallback(
        (cb) => coll.dropCollection(user, cb),
      ))
      // FLOW catch(predicate, handler) is currently unknown to flow...
      .map((promise) => promise.catch(
        (e) => /ns not found/.test(e.message), // if this is a 'not found'
        () => {}, // ignore/recover
      ));

    await Promise.all(drops);

    // Drop the user itself.
    const query = { username };
    await bluebird.fromCallback(
      (cb) => storage.users.remove(query, cb),
    );
    await bluebird.fromCallback(
      (cb) => storage.sessions.remove(
        { data: query }, cb,
      ),
    );
  }

  findUser(username: string): Promise<?UserAttributes> {
    const storage = this.storageLayer;
    const query = { username };
    const options = {};

    return bluebird.fromCallback(
      (cb) => storage.users.findOne(query, options, cb),
    );
  }

  close(): Promise<void> {
    return this.database.close();
  }
}

type UserAttributes = {
  id: string,
  username: string,
  passwordHash: string,
}

module.exports = MongoDB;
