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
  async getAll (): Promise<Map<string, Array<Webhook>>> {
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
      for (var i = 0; i < usersCount; i++) {
        user = await this.getById({ id: usersNames[i].userId }, true);
        user = user.getAccount();
        user.id = usersNames[i].userId;

        // for the crazy unknown reason in the tests invitation token, appId and referer
        // values are not validated, so lets remove them until find out how often this is the
        // case
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
    const usersCount = usersNames.length;
    let user;
    let systemStreamsSerializer = new SystemStreamsSerializer();
    for (var i = 0; i < usersCount; i++) {
      user = systemStreamsSerializer.serializeEventsToAccountInfo([usersNames[i]]);
      user = user.getAccount();
      user.id = usersNames[i].userId;
      users.push(user);
    }
    return users;
  }

  /**
   * Returns a webhook for a user, fetched by its id
   */
  async getById (user: {}, getAll: Boolean): Promise<?User> {

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
      let query = {
        '$and': [
          { 'streamIds': { '$in': Object.keys(userAccountStreamsIds) } },
          { 'streamIds': { '$eq': SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }
        ]
      };
      
      const dbItems = await bluebird.fromCallback(cb => this.storage.database.find(
        this.storage.getCollectionInfo(user),
        this.storage.applyQueryToDB(query),
        this.storage.applyOptionsToDB({}),
        cb));
      const userProfileEvents = this.storage.applyItemsFromDB(dbItems);
      // convert events to the account info structure
      return new User(userProfileEvents);
    } catch (error) {
      throw error;
    }
    //return initUser(user, this, webhook);
  }

  /**
   * Get user id from username
   */
  async getUserIdByUsername (username: string): integer {
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
        return userIdEvent.userId;
      } else {
        return 0;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user id from username
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
  async insertOne (params: object): Promise<void> {
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
      // get streams ids from the config that should be retrieved
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
        streamIds: ['username', 'unique', SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
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
        const eventsCreationActions = Object.keys(userAccountStreamsIds).map(streamId => {
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

            // get additional stream ids from the config
            let streamIds = [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE];
            if (userAccountStreamsIds[streamId].isUnique === true) {
              streamIds.push("unique");
              creationObject[streamId + '__unique'] = parameter; // repeated field for uniqness
            }
            creationObject.streamIds = streamIds;
            return bluebird.fromCallback((cb) =>
              this.storage.insertOne(user, creationObject, cb, { session }));
          }
        });
        await Promise.all(eventsCreationActions);
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
  async getUserPasswordHash (userId: string): Promise<void> {
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
}
module.exports = Repository;

/*
function initUser (user: {}, repository: Repository): User {
  return new User(_.merge({
    usersRepository: repository,
    user: User,
  }, user));
}
*/