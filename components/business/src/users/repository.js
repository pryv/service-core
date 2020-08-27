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
let converters = require('components/storage/src/converters');

/**
 * Repository of the users
 */
class Repository {
  storage;

  constructor (storage) {
    this.storage = storage;
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
      streamIds: { $in: ['username'] },
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
    let userObj;
    for (var i = 0; i < usersCount; i++) {
      userObj = await this.getById(usersNames[i].userId, true);
      // for the crazy unknown reason in the tests invitation token, appId and referer
      // values are not validated, so lets remove them until find out how often this is the
      // case
      //TODO IEVA - somehow deal that not in the repo
      user = userObj.getAccount();
      delete user.referer;
      delete user.appId;
      delete user.invitationToken;
      users.push(user);
    }
    return users;
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
      streamIds: { $in: ['username'] },
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
      users.push(new User(usersNames[i].userId, [usersNames[i]]));
    }
    return users;
  }

  /**
   * Returns a User object retrieved by userId
   * @param string userId 
   * @param boolean getAll 
   */
  async getById (userId: string, getAll: boolean): Promise<?User> {

    // get user details
    let systemStreamsSerializer = new SystemStreamsSerializer();
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds;
    if (getAll) {
      userAccountStreamsIds = systemStreamsSerializer.getAllAccountStreams();
    } else {
      userAccountStreamsIds = systemStreamsSerializer.getReadableAccountStreams();
    }
    // form the query
    let query = {
      $and: [
        { streamIds: { $in: Object.keys(userAccountStreamsIds) } },
        { streamIds: { $eq: SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
      ]
    };
    
    //const dbItems = await bluebird.fromCallback(cb => this.storage.find({ id: userId }, query, null, cb));
    const userProfileEvents = await bluebird.fromCallback(cb =>
      this.storage.find({ id: userId }, query, null, cb));
    // convert events to the account info structure
    return new User(userId, userProfileEvents);
  }

  /**
   * Get account info from username
   */
  async getAccountByUsername (username: string, getAll: boolean): Promise<?User> {
    // TODO IEVA validate for deleted users 
    const userIdEvent = await bluebird.fromCallback(cb =>
      this.storage.database.findOne(
        this.storage.getCollectionInfoWithoutUserId(),
        this.storage.applyQueryToDB({
          $and: [
            { streamIds: { $in: ['username'] } },
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
  async checkUserFieldsUniqueness (fields: object): integer {
    let query = { $or: [] }
    Object.keys(fields).forEach(key => {
      query['$or'].push({ [`${key}__unique`]: fields[key] });
    });
    const existingUser = await bluebird.fromCallback(
      (cb) => this.storage.database.findOne(
        this.storage.getCollectionInfoWithoutUserId(),
        query, null, cb));
    return existingUser;
  }

  /**
   * Form account event
   * @param {*} user 
   * @param {*} userParams 
   * @param {*} userAccountStreamsIds 
   * @param {*} session 
   */
  createEventObject (streamId, parameter, userAccountStreamsIds, accessId) {

    // get type for the event from the config
    let eventType = 'string';
    if (userAccountStreamsIds[streamId].type) {
      eventType = userAccountStreamsIds[streamId].type;
    }

    // create the event
    let creationObject = {
      // add active stream id by default
      streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
      type: eventType,
      content: parameter,
      created: timestamp.now(),
      modified: timestamp.now(),
      time: timestamp.now(),
      createdBy: accessId,
      modifiedBy: accessId,
      attachements: [],
      tags: []
    }

    creationObject = converters.createIdIfMissing(creationObject);

    // if fields has to be unique , add stream id and the field that enforces uniqueness
    if (userAccountStreamsIds[streamId].isUnique === true) {
      creationObject.streamIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
      // repeated field for uniqness
      creationObject[streamId + '__unique'] = parameter;
    }
    return creationObject;
  }

  /**
   * 
   * @param string username 
   * @param string appId
   * TODO IEVA add type sessionsStorage
   */
  async createSessionForUser (
    username: string,
    appId: string,
    sessionsStorage,
    session): string {
    let sessionData = {
      username: username,
      appId: appId
    }
    //TODO IEVA - use session 
    const sessionId = await bluebird.fromCallback((cb) =>
      sessionsStorage.generate(sessionData, cb));
    return sessionId;
  }

  async createPersonalAccessForUser (
    userId: string,
    appId: string,
    accessStorage,
    session) {
    let accessData = {
      name: appId,
      type: 'personal',
      created: timestamp.now(),
      createdBy: 'system',//Should be a constant, but there is no business class for accesses or system
      modified: timestamp.now(),
      modifiedBy: 'system',//Should be a constant, but there is no business class for accesses or system
    };

    const access = await bluebird.fromCallback((cb) =>
      accessStorage.insertOne({ id: userId }, accessData, cb));
    console.log(access,'access')
    return access?.id;
  }

  
  /**
   * Create user
   * @param userParams - parameters to be saved
   * @return object with created user information in flat format
   */
  async insertOne (params: object, sessionsStorage, accessStorage): Promise<object> {
    let userParams = Object.assign({}, params);
    let user = {};

    // first explicitly create a collection, because it would fail in the transation
    const collectionInfo = this.storage.getCollectionInfoWithoutUserId();
    await this.storage.database.createCollection(collectionInfo.name);

    // Start a transaction session
    const session = await this.storage.database.startSession();

    const transactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' }
    };

    // get streams ids from the config
    let userAccountStreamsIds = (new SystemStreamsSerializer()).getAllAccountStreamsLeaves();

    // change password into hash (also allow for tests to pass passwordHash directly)
    if (userParams.password && !userParams.passwordHash) {
      userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
    }
    delete userParams.password;

    // create userId so that userId could be passed
    userParams = converters.createIdIfMissing(userParams);
    user.id = userParams.id;

    await session.withTransaction(async () => {
      // if sessionStorage is not provided, session will be not created
     // if (sessionsStorage) {
        //const sessionId = await this.createSessionForUser(user.username, params.appId, sessionsStorage, session);
      let accessId = '';
      if (accessStorage) {
        accessId = await this.createPersonalAccessForUser(
          user.id, userParams.appId, accessStorage, session);
      }

      // create all user account events
      let creationObjects = [];
      Object.keys(userAccountStreamsIds).forEach(streamId => {
        if (userParams[streamId] || typeof userAccountStreamsIds[streamId].default !== 'undefined') {
          let parameter = userAccountStreamsIds[streamId].default;

          // set default value if undefined
          if (typeof userParams[streamId] !== 'undefined') {
            parameter = userParams[streamId];
          }

          // set parameter name and value for the result
          user[streamId] = parameter;

          let creationObject = this.createEventObject(
            streamId, parameter, userAccountStreamsIds, accessId);
          
          // if (streamId === 'username') {
          //   creationObject.id = user.id;
          // }
          creationObjects.push(creationObject);
        }
      });

      await bluebird.fromCallback((cb) =>
          this.storage.insertMany(user, creationObjects, cb, { session }));
    }, transactionOptions);
    return user;
  }

  /**
   * Update user fields that are allowed for edition in default->account streams
   * @param {*} userId 
   * @param {*} update 
   */
  async updateOne (userId: string, update: {}): Promise<void> {
    // get streams ids from the config that should be retrieved
    let userAccountStreamsIds = Object.keys((new SystemStreamsSerializer()).getAllAccountStreams());

    // change password into hash if it exists
    if (update.password && !update.passwordHash) {
      update.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(update.password, cb));
    }
    delete update.password;

    // update all account streams and do not allow additional properties
    let i;
    let streamId;
    for (i = 0; i < userAccountStreamsIds.length; i++){
      streamId = userAccountStreamsIds[i];
      if (update[streamId]) {
        await bluebird.fromCallback(cb => this.storage.updateOne(
          { id: userId, streamIds: SystemStreamsSerializer.options.STREAM_ID_ACTIVE },
          { streamIds: { $in: [streamId] } },
          { content: update[streamId] }, cb));
      }
    }
    return true;
  }

  /**
   * Deletes a user by id
   * TODO IEVA - not functioning yet so commented
   */
  async deleteMany (userId: string): Promise<void> {
    /*
    let systemStreamsSerializer = new SystemStreamsSerializer();
    const userAccountStreamsIds = Object.keys(systemStreamsSerializer.getAllAccountStreams());
    await bluebird.fromCallback(cb => this.storage.database.deleteMany(
      this.storage.getCollectionInfo({ id: userId }), { streamIds: { $in: userAccountStreamsIds}}, cb));
  */
  }

  /**
   * Get user password hash
   */
  async _getUserPasswordHash (userId: string): Promise<void> {
    let userPass;
    userPass = await bluebird.fromCallback(cb =>
      this.storage.database.findOne(
        this.storage.getCollectionInfo({ id: userId }),
        this.storage.applyQueryToDB({
          $and: [
            { streamIds: 'passwordHash' }
          ]
        }),
        this.storage.applyOptionsToDB(null), cb));
    return (userPass?.content) ? userPass.content : null;
  }

  /**
   * Checks if passwword is valid for the given userId
   * @param string userId 
   * @param string password
   */
  async checkUserPassword (userId: string, password: string): boolean {
    const currentPass = await this._getUserPasswordHash(userId);
    
    if (currentPass == null)
      throw errors.unknownResource('user', context.user.username);

    const isValid: boolean = await bluebird.fromCallback(cb =>
      encryption.compare(password, currentPass, cb));

    return isValid;
  }
}
module.exports = Repository;