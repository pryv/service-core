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
    try {
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
    } catch (error) {
      throw error;
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
    try {
      let systemStreamsSerializer = new SystemStreamsSerializer();
      // get streams ids from the config that should be retrieved
      let userAccountStreamsIds;
      if (getAll) {
        userAccountStreamsIds = systemStreamsSerializer.getAllAccountStreams();
      } else {
        userAccountStreamsIds = systemStreamsSerializer.getReadableAccountStreams();
      }
      // form the query
      //TODO IEVA -query
      let query = {
        '$and': [
          { 'streamIds': { '$in': Object.keys(userAccountStreamsIds) } },
          { 'streamIds': { '$eq': SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
        ]
      };
      
      //const dbItems = await bluebird.fromCallback(cb => this.storage.find({ id: userId }, query, null, cb));
      const userProfileEvents = await bluebird.fromCallback(cb =>
        this.storage.find({ id: userId }, query, null, cb));
      // convert events to the account info structure
      return new User(userId, userProfileEvents);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user id from username
   */
  async getAccountByUsername (username: string): Promise<?User> {
    try {
      // TODO IEVA validate for deleted users 
      const userIdEvent = await bluebird.fromCallback(cb =>
        this.storage.database.findOne(
          this.storage.getCollectionInfoWithoutUserId(),
          this.storage.applyQueryToDB({
            $and: [
              { streamIds: { '$in': ['username'] } },
              { content: { $eq: username } }]
          }),
          null, cb));

      if (userIdEvent && userIdEvent.userId) {
        return this.getById(userIdEvent.userId);
        /*return {
          id: userIdEvent.userId,
          username: username
        };*/
      } else {
        return null;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user id from username
   * @param object ({key: value}) fields 
   */
  async checkUserFieldsUniqueness (fields: object): integer {
    try {
      let query = { $or: [] }
      Object.keys(fields).forEach(key => {
        query['$or'].push({ [`${key}__unique`]: fields[key] });
      });
      const existingUser = await bluebird.fromCallback(
        (cb) => this.storage.database.findOne(
          this.storage.getCollectionInfoWithoutUserId(),
          query, null, cb));
      return existingUser;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create user
   * @param userParams - parameters to be saved
   * @return object with created user information in flat format
   */
  async insertOne (params: object): Promise<object> {
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

    try {
      // get streams ids from the config
      let userAccountStreamsIds = (new SystemStreamsSerializer()).getAllAccountStreamsLeaves();

      // change password into hash (also allow for tests to pass passwordHash directly)
      if (userParams.password && !userParams.passwordHash) {
        userParams.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(userParams.password, cb));
      }
      delete userParams.password;

      // create userId so that userId could be passed
      userParams = converters.createIdIfMissing(userParams);

      // form username event - it is separate because we set the _id 
      let updateObject = {
        streamIds: ['username', SystemStreamsSerializer.options.STREAM_ID_UNIQUE, SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
        type: userAccountStreamsIds.username.type,
        content: userParams.username,
        username__unique: userParams.username, // repeated field for uniqueness
        id: userParams.id,
        created: timestamp.now(),
        modified: timestamp.now(),
        createdBy: '',
        modifiedBy: '',
        time: timestamp.now(),
        attachements: [],
        tags: []
      };
      user.id = updateObject.id;
      await session.withTransaction(async () => {
        // insert username event
        const username = await bluebird.fromCallback((cb) =>
          this.storage.insertOne(user, updateObject, cb, { session }));
        user.username = username.content;

        // delete username so it won't be saved the second time
        delete userAccountStreamsIds['username'];

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
              createdBy: user.id,
              modifiedBy: user.id,
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
            creationObjects.push(creationObject);
          }
        });

        await bluebird.fromCallback((cb) =>
           this.storage.insertMany(user, creationObjects, cb, { session }));
      }, transactionOptions);
      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update user fields that are allowed for edition in default->account streams
   * @param {*} userId 
   * @param {*} update 
   */
  async updateOne (userId: string, update: {}): Promise<void> {
    try {
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
    } catch (error) {
      throw error;
    }
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
    try {
      const currentPass = await this._getUserPasswordHash(userId);
      
      if (currentPass == null)
        throw errors.unknownResource('user', context.user.username);

      const isValid: boolean = await bluebird.fromCallback(cb =>
        encryption.compare(password, currentPass, cb));

      return isValid;
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }
}
module.exports = Repository;