// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const Access = require('./Access');
const accessesStorage = require('components/storage').StorageLayer.accesses;
const UsersStorage = require('components/storage').StorageLayer.users;

/** 
 * Repository of all Accesses in this Pryv.io instance. 
 */
class Repository {
  storage: accessesStorage;
  usersStorage: UsersStorage;

  constructor(AccessesStorage: accessesStorage, usersStorage: UsersStorage) {
    this.storage = accessesStorage;
    this.usersStorage = usersStorage;
  }

  /**
   * Returns all accesses in a map <username, Array<accesses>>
   */
  async getAll(): Promise<Map<string, Array<Access>>> {

    const usersQuery = {};
    const usersOptions = { projection: { username: 1 } };
    const users = await bluebird.fromCallback(
      (cb) => this.usersStorage.find(usersQuery, usersOptions, cb)
    );

    const allAccesses = new Map();

    await bluebird.all(users.map(retrieveAccesses, this));
    return allAccesses;

    async function retrieveAccesses(user): Promise<void> {
      const accessesQuery = {};
      const accessesOptions = {};

      const accesses = await bluebird.fromCallback(
        (cb) => this.storage.find(user, accessesQuery, accessesOptions, cb)
      );
      const userAccesses = [];
      accesses.forEach((w) => {
        userAccesses.push(initAccesse(user, this, w));
      });
      if (userAccesses.length > 0) {
        allAccesses.set(user.username, userAccesses);
      }
    }
  }

  /** 
   * Return accesses for a given User and Access.
   * Personal access: returns all accesses
   * App access: all those created by the access
   */
  async get(user: any, access: any): Promise<Array<Access>> {

    let query = {};
    const options = {};

    if (access.isApp()) {
      query.accessId = { $eq: access.id };
    }

    const accesses = await bluebird.fromCallback(
      (cb) => this.storage.find(user, query, options, cb)
    );

    const accesseObjects = [];
    accesses.forEach((w) => {
      const accesse = initAccesse(user, this, w);
      accesseObjects.push(accesse);
    });

    return accesseObjects;
  }

  /**
   * Returns a accesse for a user, fetched by its id
   */
  async getById(user: any, accesseId: string): Promise<?Access> {
    const query = {
      id: { $eq: accesseId }
    };
    const options = {};

    const accesse = await bluebird.fromCallback(
      cb => this.storage.findOne(user, query, options, cb)
    );

    if (accesse == null) return null;

    return initAccesse(user, this, accesse);
  }

  /**
   * Inserts a accesse for a user
   */
  async insertOne(user: {}, accesse: Accesse): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.insertOne(user, accesse.forStorage(), cb)
    );
  }

  /**
   * Updates certain fields of a accesse for a user
   */
  async updateOne(user: {}, update: {}, accesseId: string): Promise<void> {
    const query = { id: accesseId };
    await bluebird.fromCallback(cb =>
      this.storage.updateOne(user, query, update, cb)
    );
  }

  /**
   * Deletes a accesse for a user, given the accesse's id
   */
  async deleteOne(user: {}, accesseId: string): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.delete(user, { id: accesseId }, cb)
    );
  }

  /**
   * Deletes all accesses for a user.
   */
  async deleteForUser(user: {}): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.delete(user, {}, cb)
    );
  }

}
module.exports = Repository;

function initAccesse(user: {}, repository: Repository, accesse: {}): Accesse {
  return new Accesse(_.merge({
    accessesRepository: repository,
    user: user,
  }, accesse));
}
