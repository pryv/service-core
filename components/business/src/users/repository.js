/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');
const timestamp = require('unix-timestamp');

const User = require('./User');
const Event = require('business/src/events/Event');
const Access = require('business/src/accesses/Access');
const SystemStream = require('business/src/system-streams/SystemStream');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const encryption = require('utils').encryption;
const errors = require('errors').factory;

/**
 * Repository of the users
 */
class Repository {
  storage: {};
  sessionsStorage: {};
  accessStorage: {};
  collectionInfo: {};
  uniqueFields: Array<string>;

  constructor (eventsStorage: {}, sessionsStorage: {}, accessStorage: {}) {
    this.storage = eventsStorage;
    this.sessionsStorage = sessionsStorage;
    this.accessStorage = accessStorage;
    this.collectionInfo = eventsStorage.getCollectionInfoWithoutUserId();
    this.uniqueFields = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
  }

  /**
  * Returns all users
  * Only used for testing and nightly. Very indefficient!
  */
  async getAll(): Promise<Array<User>> {

    // get list of user ids and usernames
    const query: {} = {
      streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] },
      deleted: null,
      headId: null
    }
    
    const userIdObjects: Array<{}> = await bluebird.fromCallback(cb =>
      this.storage.database.find(
        this.collectionInfo,
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB(null), cb)
    );

    const users: Array<User> = [];
    for (const userIdObject of userIdObjects) {
      const user = await this.getById(userIdObject.userId, true);
      users.push(user);
    }
    return users;
  }

  /**
   * Get object with transaction options
   */
  getTransactionOptions(): {} {
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
  async getAllUsernames(): Promise<Array<User>> {
    // get list of user ids and usernames
    const query: {} = {
      streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] },
      deleted: null,
      headId: null
    }
    
    const userIdObjects: Array<{}> = await bluebird.fromCallback(cb =>
      this.storage.database.find(
        this.collectionInfo,
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB(null), cb)
    );

    const users: Array<User> = [];
    for (const userIdObject of userIdObjects) {
      users.push(new User({ id: userIdObject.userId, events: [userIdObject]}));
    }
    return users;
  }

  /**
   * Returns a User object retrieved by userId
   * @param string userId 
   * @param boolean getAll 
   */
  async getById(userId: string, getAll: boolean): Promise<?User> {
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds: ?Map<string, SystemStream>;
    if (getAll) {
      userAccountStreamsIds = SystemStreamsSerializer.getAccountMap();
    } else {
      userAccountStreamsIds = SystemStreamsSerializer.getReadableAccountMap();
    }
    const query: {} = {
      $and: [
        { streamIds: { $in: Object.keys(userAccountStreamsIds) } },
        { streamIds: { $eq: SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
      ]
    };

    const userAccountEvents: Array<Event> = await bluebird.fromCallback(cb =>
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
  async getAccountByUsername(username: string, getAll: boolean): Promise<?User> {
    const userIdEvent = await bluebird.fromCallback(cb =>
      this.storage.database.findOne(
        this.collectionInfo,
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
  async findExistingUniqueFields(fields: {}): Promise<{}> {
    const query = { $or: [] }
    Object.keys(fields).forEach(key => {
      query['$or'].push({
        $and:
          [
            { streamIds: SystemStreamsSerializer.addPrivatePrefixToStreamId(key) },
            { content: fields[key] }
          ]
      });
    });

    const existingUsers = await bluebird.fromCallback(
      (cb) => this.storage.database.find(
        this.collectionInfo,
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
  async createSessionForUser(
    username: string,
    appId: string,
    transactionSession: any
  ): Promise<string> {
    return await bluebird.fromCallback((cb) =>
      this.sessionsStorage.generate(
        { username, appId },
        { transactionSession },
        cb,
      ));
  }

  async createPersonalAccessForUser(
    userId: string,
    token: string,
    appId: string,
    transactionSession
  ): Access {

    const accessData = {
      token: token,
      userId: userId,
      name: appId,
      type: Repository.options.ACCESS_TYPE_PERSONAL,
      created: timestamp.now(),
      createdBy: Repository.options.SYSTEM_USER_ACCESS_ID,
      modified: timestamp.now(),
      modifiedBy: Repository.options.SYSTEM_USER_ACCESS_ID,
    };

    return await bluebird.fromCallback((cb) =>
      this.accessStorage.insertOne({ id: userId }, accessData, cb, { transactionSession }));
  }

  validateAllStorageObjectsInitialized(): boolean {
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
  async insertOne(user: User, shouldCreateSession: Boolean): Promise<User> {
    // first explicitly create a collection, because it would fail in the transation
    
    await bluebird.fromCallback(
      cb => this.storage.database.getCollection(this.collectionInfo, cb));

    await this.checkDuplicates(user);

    // Start a transaction session
    const transactionSession = await this.storage.database.startSession();
    await transactionSession.withTransaction(async () => {
      // if sessionStorage is not provided, session will be not created
      let accessId = Repository.options.SYSTEM_USER_ACCESS_ID;
      if (shouldCreateSession && this.validateAllStorageObjectsInitialized() && user.appId != null) {
        const token: string = await this.createSessionForUser(user.username, user.appId, transactionSession);
        const access = await this.createPersonalAccessForUser(
          user.id, token, user.appId, transactionSession);
        accessId = access?.id;
        user.token = access.token;
      }
      user.accessId = accessId;
      
      // create all user account events
      const events: Array<Event> = await user.getEvents();
    
      await bluebird.fromCallback((cb) =>
        this.storage.insertMany({ id: user.id }, events, cb, { transactionSession }));
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
  async updateOne(user: User, update: {}, accessId: string): Promise<void> {

    // change password into hash if it exists
    if (update.password != null) {
      update.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(update.password, cb));
    }
    delete update.password;
    
    // Start a transaction session
    const transactionSession = await this.storage.database.startSession();
    await transactionSession.withTransaction(async () => {
      // update all account streams and don't allow additional properties
      for (const [streamIdWithoutPrefix, content] of Object.entries(update)) {
      //for (let i = 0; i < eventsForUpdate.length; i++) {
        await bluebird.fromCallback(cb => this.storage.updateOne(
          { id: user.id },
          {
            streamIds: {
              $all: [
                SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix),
                SystemStreamsSerializer.options.STREAM_ID_ACTIVE,
              ]
            }
          },
          {
            content,
            modified: timestamp.now(),
            modifiedBy: accessId,
          },
          cb,
          { transactionSession }
        ));
      }
    }, this.getTransactionOptions());
  }

  /**
   * Deletes a user by id
   */
  async deleteOne (userId: string): Promise<number> {
    const userAccountStreamsIds: Array<string> = SystemStreamsSerializer.getAccountStreamIds();
    return await bluebird.fromCallback(cb => this.storage.database.deleteMany(
      this.storage.getCollectionInfo(userId),
      { streamIds: { $in: userAccountStreamsIds } }, cb));
  }

  /**
   * Checks if passwword is valid for the given userId
   * @param string userId 
   * @param string password
   */
  async checkUserPassword (userId: string, password: string): Promise<boolean> {
    const currentPass = await getUserPasswordHash(userId, this.storage);
    let isValid: boolean = false;
    if (currentPass != null) {
      isValid = await bluebird.fromCallback(cb =>
        encryption.compare(password, currentPass, cb));
    }
    return isValid;
  }

  /**
   * counts the number of users
   */
  async count(): Promise<number> {
    return await bluebird.fromCallback(cb => {
      this.storage.count({}, { streamIds: SystemStreamsSerializer.options.STREAM_ID_USERNAME }, cb);
    });
  }

  /**
   * Checks for duplicates for unique fields. Throws DuplicateError if any.
   * 
   * @param {User} user - a user object or 
   */
  async checkDuplicates(user: User): Promise<void> {

    /**
     * forEach user.uniqueFields
     * streamIds.contains(field) && content = user[field]
     */
    const orClause = [];
    this.uniqueFields.forEach(field => {
      if (user[field] != null) {
        orClause.push({
          content: { $eq: user[field] },
          streamIds: SystemStreamsSerializer.addPrivatePrefixToStreamId(field),
        });
      }
    });

    const query: {} = {
      $or: orClause,
    };

    const duplicateEvents = await bluebird.fromCallback(cb =>
      this.storage.find(
        this.collectionInfo,
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB(null),
        cb
      )
    );
    if (duplicateEvents != null && duplicateEvents.length > 0) {
      const error = new Error('walou');
      error.isDuplicate = true;
      const duplicatesMap = {};
      const duplicates = [];
      duplicateEvents.forEach(duplicate => {
        const key = extractDuplicateField(this.uniqueFields, duplicate.streamIds);
        duplicates.push(key);
        duplicatesMap[key] = true;
      });
      error.isDuplicateIndex = (key): Map<string, boolean> => duplicatesMap[key];
      error.getDuplicateSystemStreamIds = (): Array<string> => duplicates;
      
      throw error;
    }
    return;

    /**
     * Performs intersection of 2 arrays of streamIds: one with prefixes, on without.
     * Returns the first element of the array, as we expect a single one.
     * 
     * @param {*} streamIdsWithoutPrefix 
     * @param {*} streamIdsWithPrefix 
     */
    function extractDuplicateField(streamIdsWithoutPrefix, streamIdsWithPrefix): string {
      const intersection: Array<string> = streamIdsWithoutPrefix.filter(streamIdWithoutPrefix => 
        streamIdsWithPrefix.includes(SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix))
      )
      return intersection[0];
    }
  }
}

/**
 * Get user password hash
 * @param string userId 
 */
async function getUserPasswordHash(userId: string, storage: any): Promise <?string> {
  const userPass: Event = await bluebird.fromCallback(cb =>
    storage.findOne({ id: userId },
      {
        $and: [
          { streamIds: SystemStreamsSerializer.options.STREAM_ID_PASSWORDHASH }
        ]
      }, null, cb));
  return (userPass?.content != null) ? userPass.content : null;
}

Repository.options = {
  SYSTEM_USER_ACCESS_ID: 'system',
  ACCESS_TYPE_PERSONAL: 'personal',
}
module.exports = Repository;