/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const timestamp = require('unix-timestamp');

const User = require('./User');
const UserRepositoryOptions = require('./UserRepositoryOptions');
import type { Event } from 'business/src/events';
import type { Access } from 'business/src/accesses';
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const encryption = require('utils').encryption;
const errors = require('errors').factory;

const usersIndex = require('./UsersLocalIndex');
const { getMall } = require('mall');
const { getPlatform } = require('platform');

const cache = require('cache');

/**
 * Repository of the users
 */
class UsersRepository {
  storageLayer: {};
  sessionsStorage: {};
  accessStorage: {};
  mall: {};
  platform: null;

  constructor() {
  }

  async init() {
    this.mall = await getMall();
    this.platform = await getPlatform();

    const storage = require('storage');
    this.storageLayer = await storage.getStorageLayer();
    this.sessionsStorage = this.storageLayer.sessions;
    this.accessStorage = this.storageLayer.accesses;
    await usersIndex.init();
  }

  // only for testing
  async getAll(): Promise<Array<User>> {
    const usersMap = await usersIndex.getAllByUsername();

    const users: Array<User> = [];
    for (const [username, userId] of Object.entries(usersMap)) {
      const user = await this.getUserById(userId);
      if (user == null) {
        throw new Error(`Repository inconsistency, userIndex list user id: "${userId}" username: "${username}" but cann get it with getUserById(userId)`);
      }
      users.push(user);
    }
    return users;
  }

  // only for test data to reset all users Dbs.
  async deleteAll(): Promise<void> {
    const usersMap = await usersIndex.getAllByUsername();
    for (const [, userId] of Object.entries(usersMap)) {
      await this.mall.deleteUser(userId);
    }
    await usersIndex.deleteAll();
    await this.platform.deleteAll();
  }

  async getAllUsernames(): Promise<Array<User>> {
    const usersMap = await usersIndex.getAllByUsername();

    const users: Array<User> = [];
    for (const [username, userId] of Object.entries(usersMap)) {
      users.push({id: userId, username: username});
    }
    return users;
  }

  async getUserIdForUsername(username: string) {
    return await usersIndex.getUserId(username);
  }

  async getUserById(userId: string): Promise<?User> {
    const userAccountStreamsIds =  Object.keys(SystemStreamsSerializer.getAccountMap());
    const query = {state: 'all', streams: [{any: userAccountStreamsIds, and: [{any: [SystemStreamsSerializer.options.STREAM_ID_ACTIVE]}]}]};
    const userAccountEvents: Array<Event>  = await this.mall.events.get(userId, query);
    const username = await usersIndex.getUsername(userId);
    // convert events to the account info structure
    if (
      userAccountEvents.length == 0
    ) {
      return null;
    }

    if (username == null) {
      throw new Error('Inconsistency between userEvents and usersIndex, found null username for userId: "' + userId + '" with ' + userAccountEvents.length + ' user account events');
    }
    const user = new User({ id: userId, username: username, events: userAccountEvents });
    return user;
  }

  async getUserByUsername(username: string): Promise<?User> {
    let userId = await this.getUserIdForUsername(username);
    if (userId) {
      const user = await this.getUserById(userId);
      return user;
    }
    return null;
  }

  async getStorageUsedByUserId(userId: string): Promise<?any>  {
    return {
      dbDocuments: await this.getOnePropertyValue(userId, 'dbDocuments') || 0,
      attachedFiles: await this.getOnePropertyValue(userId, 'attachedFiles') || 0
    };
  }

  async getOnePropertyValue(userId: string, propertyKey: string) {
    const query = {limit: 1, state: 'all', streams: [{any: [SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(propertyKey)]}]};
    const userAccountEvents: Array<Event>  = await this.mall.events.get(userId, query);
    if (! userAccountEvents || ! userAccountEvents[0]) return null;
    return userAccountEvents[0].content;
  }

  async createSessionForUser(
    username: string,
    appId: string,
    transactionSession: any,
  ): Promise<string> {
    return await bluebird.fromCallback(
      cb => this.sessionsStorage.generate(
        { username, appId },
        { transactionSession },
        cb,
      ),
    );
  }

  async createPersonalAccessForUser(
    userId: string,
    token: string,
    appId: string,
    transactionSession,
  ): Access {
    const accessData = {
      token: token,
      name: appId,
      type: UserRepositoryOptions.ACCESS_TYPE_PERSONAL,
      created: timestamp.now(),
      createdBy: UserRepositoryOptions.SYSTEM_USER_ACCESS_ID,
      modified: timestamp.now(),
      modifiedBy: UserRepositoryOptions.SYSTEM_USER_ACCESS_ID,
    };

    return await bluebird.fromCallback(
      cb => this.accessStorage.insertOne(
        { id: userId },
        accessData,
        cb,
        { transactionSession },
      ),
    );
  }

  validateAllStorageObjectsInitialized(): boolean {
    if (this.accessStorage == null || this.sessionsStorage == null) {
      throw new Error('Please initialize the user repository with all dependencies.');
    }
    return true;
  }

  async insertOne(user: User, withSession: ?boolean = false, skipFowardToRegister: ?boolean = false): Promise<User> {
    // Create the User at a Platfrom Level..
    const operations = [];
    for (const key of SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix()) {
      // use default value is null;
      const value = (user[key] != null) ? user[key] : SystemStreamsSerializer.getAccountFieldDefaultValue(key);
      if (value != null) {
        operations.push({
          action: 'create',
          key: key,
          value: value,
          isUnique: SystemStreamsSerializer.isUniqueAccountField(key),
          isActive: true
        });
      }
    }

    // check locally for username // <== maybe this usersIndex should be fully moved to platform
    if (await usersIndex.usernameExists(user.username)) {
      // gather eventual other uniqueness conflicts
      const eventualPlatformUniquenessErrors = await this.platform.checkUpdateOperationUniqueness(user.username, operations);
      const uniquenessError = errors.itemAlreadyExists('user', eventualPlatformUniquenessErrors);
      uniquenessError.data.username = user.username;
      throw uniquenessError;
    }

    // could throw uniqueness errors
    await this.platform.updateUserAndForward(user.username, operations, skipFowardToRegister);

    const mallTransaction = await this.mall.newTransaction();
    const localTransaction = await mallTransaction.getStoreTransaction('local');

    await localTransaction.exec(async () => {
      let accessId = UserRepositoryOptions.SYSTEM_USER_ACCESS_ID;
      if (
        withSession && this.validateAllStorageObjectsInitialized() &&
        user.appId != null
      ) {
        const token: string = await this.createSessionForUser(
          user.username,
          user.appId,
          localTransaction.transactionSession,
        );
        const access = await this.createPersonalAccessForUser(
          user.id,
          token,
          user.appId,
          localTransaction.transactionSession,
        );
        accessId = access?.id;
        user.token = access.token;
      }
      user.accessId = accessId;

      const events: Array<Event> = await user.getEvents();

      // add the user to local index
      await usersIndex.addUser(user.username, user.id);

      await this.mall.events.createMany(user.id, events, mallTransaction);
    });
    return user;
  }

  async updateOne(user: User, update: {}, accessId: string): Promise<void> {
    // change password into hash if it exists
    if (update.password != null) {
      update.passwordHash = await bluebird.fromCallback(
        cb => encryption.hash(update.password, cb),
      );
    }
    delete update.password;

    // Start a transaction session
    const mallTransaction = await this.mall.newTransaction();
    const localTransaction = await mallTransaction.getStoreTransaction('local');

    await localTransaction.exec(async () => {
      // update all account streams and don't allow additional properties
      for (const [streamIdWithoutPrefix, content] of Object.entries(update)) {
      //for (let i = 0; i < eventsForUpdate.length; i++) {

        const query = {streams: [{
          any: [SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(streamIdWithoutPrefix)],
          and: [{any: [SystemStreamsSerializer.options.STREAM_ID_ACTIVE]}]
        }]};
        const updateFields =  {
          content,
          modified: timestamp.now(),
          modifiedBy: accessId,
        };
        await this.mall.events.updateMany(user.id, query, {fieldsToSet: updateFields}, mallTransaction);
      }
    });
  }

  async deleteOne(userId: string, username: ?string, skipFowardToRegister: ?boolean): Promise<number> {
    const user = await this.getUserById(userId);
    if (username == null) {
      username = user?.username;
    }

    await usersIndex.init();
    await usersIndex.deleteById(userId);

    if (username != null) { // can happen during tests
      cache.unsetUser(username);
      // Clear data for this user in Platform
      await this.platform.deleteUser(username, user, skipFowardToRegister);
    }
    await this.mall.deleteUser(userId);
  }

  async checkUserPassword(userId: string, password: string): Promise<boolean> {
    const currentPass = await getUserPasswordHash(userId, this.mall);
    let isValid: boolean = false;
    if (currentPass != null) {
      isValid = await bluebird.fromCallback(
        cb => encryption.compare(password, currentPass, cb),
      );
    }
    return isValid;
  }
  async count(): Promise<number> {
    const users = await usersIndex.getAllByUsername();
    return Object.keys(users).length;
  }
}

/**
 * Get user password hash
 * @param string userId
 */
async function getUserPasswordHash(userId: string, mall: any): Promise<?string> {
  const userPassEvents = await mall.events.get(userId, {streams: [{any: [SystemStreamsSerializer.options.STREAM_ID_PASSWORDHASH]}]});
  if (userPassEvents.length > 0) {
    return (userPassEvents[0].content != null) ? userPassEvents[0].content : null;
  }
  return null;
}

let usersRepository = null;
let usersRepositoryInitializing = false;
async function getUsersRepository() {
  while (usersRepositoryInitializing) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!usersRepository) {
    usersRepositoryInitializing = true;
    usersRepository = new UsersRepository();
    await usersRepository.init();
    usersRepositoryInitializing = false;
  }
  return usersRepository;
}

module.exports = {
  getUsersRepository,
};
