/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');
const timestamp = require('unix-timestamp');

const User = require('./User');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
let encryption = require('components/utils').encryption;
const errors = require('components/errors').factory;

/**
 * Repository of the users
 */
class Repository {
  storage;
  sessionsStorage;
  accessStorage;

  constructor (eventsStorage, sessionsStorage, accessStorage) {
    this.storage = eventsStorage;
    this.sessionsStorage = sessionsStorage;
    this.accessStorage = accessStorage;
  }

 /**
  * Get All users
  * (Used for testing and for the nighty job to make each user structure
  * compatible with a previous account structure and it is implemented in
  * inefficiant way)
  */
  async getAll (): Promise<Map<string, Array<User>>> {
    let users = [];
    // get list of user ids and usernames
    let query = {
      streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] },
      deleted: null,
      headId: null
    }
    
    const usersNames = await bluebird.fromCallback(cb =>
      this.storage.database.find(
        this.storage.getCollectionInfoWithoutUserId(),
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB(null), cb)
    );

    const usersCount = usersNames.length;
    let user;
    for (var i = 0; i < usersCount; i++) {
      user = await this.getById(usersNames[i].userId, true);
      // for the crazy unknown reason in the tests invitation token, appId and referer
      // values are not validated, so lets remove them until find out how often this is the
      // case
      //TODO IEVA - somehow deal that not in the repo
      delete user.referer;
      delete user.appId;
      delete user.invitationToken;
      users.push(user);
    }
    return users;
  }

  /**
   * Get object with transaction options
   */
  getTransactionOptions () {
    return {
      readPreference: 'primary',
        readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    }
  }
  /**
   * Get All usernames
   * Does the same as this.getAll(), just retrieves - only username and id
   * Used for the webhooks
   */
  async getAllUsernames (): Promise<Array<User>> {
    let users = [];
    // get list of user ids and usernames
    let query = {
      streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] },
      deleted: null,
      headId: null
    }
    const usersNames = await bluebird.fromCallback(cb =>
      this.storage.database.find(
        this.storage.getCollectionInfoWithoutUserId(),
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB(null), cb)
    );

    for (var i = 0; i < usersNames.length; i++) {
      users.push(new User({ id: usersNames[i].userId, events: [usersNames[i]]}));
    }
    return users;
  }

  /**
   * Returns a User object retrieved by userId
   * @param string userId 
   * @param boolean getAll 
   */
  async getById (userId: string, getAll: boolean): Promise<?User> {
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds;
    if (getAll) {
      userAccountStreamsIds = SystemStreamsSerializer.getAllAccountStreams();
    } else {
      userAccountStreamsIds = SystemStreamsSerializer.getReadableAccountStreams();
    }
    // form the query
    let query = {
      $and: [
        { streamIds: { $in: Object.keys(userAccountStreamsIds) } },
        { streamIds: { $eq: SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
      ]
    };
    
    //const dbItems = await bluebird.fromCallback(cb => this.storage.find({ id: userId }, query, null, cb));
    const userAccountEvents = await bluebird.fromCallback(cb =>
      this.storage.find({ id: userId }, query, null, cb));
    
    // convert events to the account info structure
    if (userAccountEvents.length == 0) {
      return null;
    }
    return new User({ id: userId, events: userAccountEvents });
  }

  /**
   * Get account info from username
   */
  async getAccountByUsername (username: string, getAll: boolean): Promise<?User> {
    const userIdEvent = await bluebird.fromCallback(cb =>
      this.storage.database.findOne(
        this.storage.getCollectionInfoWithoutUserId(),
        this.storage.applyQueryToDB({
          $and: [
            { streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] } },
            { content: { $eq: username } }]
        }),
        null, cb));
    
    if (userIdEvent && userIdEvent.userId) {
      return this.getById(userIdEvent.userId, getAll);
    } else {
      return null;
    }
  }

  /**
   * Check if fields are unique
   * @param ({key: value}) fields
   */
  async findExistingUniqueFields (fields: {}): number {
    let query = { $or: [] }
    Object.keys(fields).forEach(key => {
      query['$or'].push({
        $and:
          [
            { streamIds: SystemStreamsSerializer.addDotToStreamId(key) },
            { [`${key}__unique`]: fields[key] }
          ]
      });
    });

    const existingUsers = await bluebird.fromCallback(
      (cb) => this.storage.database.find(
        this.storage.getCollectionInfoWithoutUserId(),
        query, {}, cb));
    return existingUsers;
  }

  /**
   * Creates a session for registered user that is needed 
   * to get personal access
   * @param string username
   * @param string appId 
   * @param object session 
   */
  async createSessionForUser (
    username: string,
    appId: string,
    session: any): string {
    let sessionData = {
      username: username,
      appId: appId
    }
    const sessionId = await bluebird.fromCallback((cb) =>
      this.sessionsStorage.generate(sessionData, cb, { session }));
    return sessionId;
  }

  async createPersonalAccessForUser (
    userId: string,
    token: string,
    appId: string,
    session) {

    let accessData = {
      token: token,
      userId: userId,
      name: appId,
      type: Repository.options.ACCESS_TYPE_PERSONAL,
      created: timestamp.now(),
      createdBy: Repository.options.SYSTEM_USER_ACCESS_ID,
      modified: timestamp.now(),
      modifiedBy: Repository.options.SYSTEM_USER_ACCESS_ID,
    };

    const access = await bluebird.fromCallback((cb) =>
      this.accessStorage.insertOne({ id: userId }, accessData, cb, { session }));

    return access;
  }

  validateAllStorageObjectsInitialized () {
    if (!this.accessStorage || !this.sessionsStorage) {
      throw new Error('Please initialize the user repository with all dependencies.');
    }
    return true;
  }

  /**
   * Create user
   * @param userParams - parameters to be saved
   * @return object with created user information in flat format
   */
  async insertOne (user: User, shouldCreateSession: Boolean): Promise<object> {
    // first explicitly create a collection, because it would fail in the transation
    const collectionInfo = this.storage.getCollectionInfoWithoutUserId();
    await this.storage.database.createCollection(collectionInfo.name);

    // Start a transaction session
    const session = await this.storage.database.startSession();
    await session.withTransaction(async () => {
      // if sessionStorage is not provided, session will be not created
      let accessId = Repository.options.SYSTEM_USER_ACCESS_ID;
      if (shouldCreateSession && this.validateAllStorageObjectsInitialized() && user.appId) {
        const token = await this.createSessionForUser(user.username, user.appId, session);
        const access = await this.createPersonalAccessForUser(
          user.id, token, user.appId, session);
        accessId = access?.id;
        user.token = access.token;
      }
      user.accessId = accessId;
      
      // create all user account events
      const events = await user.getEvents();
      await bluebird.fromCallback((cb) =>
        this.storage.insertMany({ id: user.id }, events, cb, { session }));
    }, this.getTransactionOptions());
    return user;
  }

  /**
   * Update all account streams events
   * validation of editable non editable should be done before
   * in default->account streams
   * @param User user
   * @param {} update 
   * @param string accessId
   */
  async updateOne (user: User, update: {}, accessId: string): Promise<void> {
    const eventForUpdate = await user.getEventsDataForUpdate(update, accessId);
    // Start a transaction session
    const session = await this.storage.database.startSession();
    await session.withTransaction(async () => {
      // update all account streams and don't allow additional properties
      for (let i = 0; i < eventForUpdate.length; i++) {
        await bluebird.fromCallback(cb => this.storage.updateOne(
          { id: user.id },
          {
            streamIds: {
              $all: [
                eventForUpdate[i].streamId,
                SystemStreamsSerializer.options.STREAM_ID_ACTIVE
              ]
            }
          },
          eventForUpdate[i].updateData,
          cb,
          { session }
        ));
      }
    }, this.getTransactionOptions());
  }

  /**
   * Deletes a user by id
   * @param string userId 
   */
  async deleteOne (userId: string): Promise<void> {
    const userAccountStreamsIds = Object.keys(SystemStreamsSerializer.getAllAccountStreams());
    await bluebird.fromCallback(cb => this.storage.database.deleteMany(
      this.storage.getCollectionInfo({ id: userId }),
      { streamIds: { $in: userAccountStreamsIds } }, cb));
  }

  /**
   * Checks if passwword is valid for the given userId
   * @param string userId 
   * @param string password
   */
  async checkUserPassword (userId: string, password: string): boolean {
    const currentPass = await getUserPasswordHash(userId, this.storage);
    let isValid: boolean = false;
    if (currentPass != null) {
      isValid = await bluebird.fromCallback(cb =>
        encryption.compare(password, currentPass, cb));
    }
    return isValid;
  }

  /**
   * Checks if passwword is valid for the given userId
   * @param string userId 
   * @param string password
   */
  async count (): number {
    return await bluebird.fromCallback(cb => {
      this.storage.count({}, { streamIds: SystemStreamsSerializer.options.STREAM_ID_USERNAME }, cb);
    });
  }
}

/**
 * Get user password hash
 * @param string userId 
 */
async function getUserPasswordHash(userId: string, storage: any): Promise < void> {
  let userPass;
  userPass = await bluebird.fromCallback(cb =>
    storage.findOne({ id: userId },
      {
        $and: [
          { streamIds: SystemStreamsSerializer.options.STREAM_ID_PASSWORDHASH }
        ]
      }, null, cb));
  return (userPass?.content) ?userPass.content : null;
}

Repository.options = {
  SYSTEM_USER_ACCESS_ID: 'system',
  ACCESS_TYPE_PERSONAL: 'personal',
}
module.exports = Repository;