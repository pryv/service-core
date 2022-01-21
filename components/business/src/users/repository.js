/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');
const timestamp = require('unix-timestamp');

const User = require('./User');
const UserRepositoryOptions = require('./UserRepositoryOptions');
import type { Event } from 'business/src/events';
import type { Access } from 'business/src/accesses';
import type { SystemStream } from 'business/src/system-streams';
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const encryption = require('utils').encryption;
const errors = require('errors').factory;
const { safetyCleanDuplicate } = require('business/src/auth/service_register');

const userIndex = require('./UserLocalIndex');
const { getMall } = require('mall');

const cache = require('cache');

/**
 * Repository of the users
 */
class UsersRepository {
  storageLayer: {};
  eventsStorage: {};
  sessionsStorage: {};
  accessStorage: {};
  collectionInfo: {};
  uniqueFields: Array<string>;
  mall: {};
  constructor() {
    this.uniqueFields = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
  }

  async init() {
    this.mall = await getMall();

    const storage = require('storage');
    this.storageLayer = await storage.getStorageLayer();
    this.eventsStorage = this.storageLayer.events;
    this.sessionsStorage = this.storageLayer.sessions;
    this.accessStorage = this.storageLayer.accesses;
    this.collectionInfo = this.eventsStorage.getCollectionInfoWithoutUserId();
    await userIndex.init();
  }

  // only for testing
  async getAll(): Promise<Array<User>> {
    const usersMap = await userIndex.allUsersMap(); 

    const users: Array<User> = [];
    for (const [username, userId] of Object.entries(usersMap)) {
      const user = await this.getUserById(userId);
      users.push(user);
    }
    return users;
  }

  // only for test data to be reset
  async deleteAll(): Promise<void> {
    await userIndex.deleteAll();
  }

  
  async getAllUsernames(): Promise<Array<User>> {
    const usersMap = await userIndex.allUsersMap(); 

    const users: Array<User> = [];
    for (const [username, userId] of Object.entries(usersMap)) {
      users.push({id: userId, username: username});
    }
    return users;
  }

  async getUserIdForUsername(username: string) {
    return await userIndex.idForName(username);
  }

  async getUserById(userId: string): Promise<?User> {
    const userAccountStreamsIds =  Object.keys(SystemStreamsSerializer.getAccountMap());

    const query = {state: 'all', streams: [{any: userAccountStreamsIds, and: [{any: [SystemStreamsSerializer.options.STREAM_ID_ACTIVE]}]}]};
    const userAccountEvents: Array<Event>  = await this.mall.events.get(userId, query);
    // convert events to the account info structure
    if (
      userAccountEvents.length == 0
    ) {
      return null;
    }
    const username = await userIndex.nameForId(userId);
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
      dbDocuments: await this.getOnePropertyValue(userId, 'dbDocuments') || 0,
      attachedFiles: await this.getOnePropertyValue(userId, 'attachedFiles') || 0
    };
  }

  async getOnePropertyValue(userId: string, propertyKey: string) {
    const query = {limit: 1, state: 'all', streams: [{any: [SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(propertyKey)]}]};
    const userAccountEvents: Array<Event>  = await this.mall.events.get(userId, query);
    if (! userAccountEvents || ! userAccountEvents[0]) return null;
    return userAccountEvents[0].content;
  };

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
      throw (
        new Error(
          "Please initialize the user repository with all dependencies.",
        )
      );
    }
    return true;
  }

  async insertOne(user: User, withSession: ?boolean = false): Promise<User> {
    // first explicitly create a collection, because it would fail in the transation
    await bluebird.fromCallback(
      cb => this.eventsStorage.database.getCollection(this.collectionInfo, cb),
    );

    await this.checkDuplicates(user);

    const transactionSession = await this.eventsStorage.database.startSession();
    await transactionSession.withTransaction(
      async () => {
        let accessId = UserRepositoryOptions.SYSTEM_USER_ACCESS_ID;
        if (
          withSession && this.validateAllStorageObjectsInitialized() &&
          user.appId != null
        ) {
          const token: string = await this.createSessionForUser(
            user.username,
            user.appId,
            transactionSession,
          );
          const access = await this.createPersonalAccessForUser(
            user.id,
            token,
            user.appId,
            transactionSession,
          );
          accessId = access?.id;
          user.token = access.token;
        }
        user.accessId = accessId;

        const events: Array<Event> = await user.getEvents();

        // add the user to local index
        await userIndex.addUser(user.username, user.id);
        
        await bluebird.fromCallback(
          cb => this.eventsStorage.insertMany(
            { id: user.id },
            events,
            cb,
            { transactionSession },
          ),
        );
      },
      getTransactionOptions(),
    );
    return user;
  }

  async updateOne(user: User, update: {}, accessId: string): Promise<void> {
   
    await this.checkDuplicates(update);
    
    // change password into hash if it exists
    if (update.password != null) {
      update.passwordHash = await bluebird.fromCallback(
        cb => encryption.hash(update.password, cb),
      );
    }
    delete update.password;
    
    // Start a transaction session
    const transactionSession = await this.eventsStorage.database.startSession();
    await transactionSession.withTransaction(async () => {
      // update all account streams and don't allow additional properties
      for (const [streamIdWithoutPrefix, content] of Object.entries(update)) {
      //for (let i = 0; i < eventsForUpdate.length; i++) {
        await bluebird.fromCallback(cb => this.eventsStorage.updateOne(
          { id: user.id },
          {
            streamIds: {
              $all: [
                SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(streamIdWithoutPrefix),
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
    }, getTransactionOptions());
  }
  async deleteOne(userId: string, username: ?string): Promise<number> {
    const userAccountStreamsIds: Array<string> = SystemStreamsSerializer.getAccountStreamIds();
    if (username == null) {
      const user = await this.getUserById(userId);
      username = user?.username;
    }
    cache.unsetUser(username);
    await userIndex.init();
    await userIndex.deleteById(userId);

    const result = await bluebird.fromCallback(
      cb => this.eventsStorage.database.deleteMany(
        this.eventsStorage.getCollectionInfo(userId),
        { streamIds: { $in: userAccountStreamsIds } },
        cb,
      ),
    );
    
    return result;
  }
  async checkUserPassword(userId: string, password: string): Promise<boolean> {
    const currentPass = await getUserPasswordHash(userId, this.eventsStorage);
    let isValid: boolean = false;
    if (currentPass != null) {
      isValid = await bluebird.fromCallback(
        cb => encryption.compare(password, currentPass, cb),
      );
    }
    return isValid;
  }
  async count(): Promise<number> {
    const users = await userIndex.allUsersMap();
    return Object.keys(users).length;
  }

  /**
   * Checks for duplicates for unique fields. Throws item already exists error if any.
   * 
   * @param {User} user - a user object or 
   */
  async checkDuplicates(user: User): Promise<void> {
    const that = this;
    const uniquenessErrors = await getUniquessErrorFields(user);

    if (await userIndex.existsUsername(user.username)) {
      uniquenessErrors.username = user.username;
    }

    if (Object.keys(uniquenessErrors).length > 0) {
      throw (
        errors.itemAlreadyExists(
          "user",
          uniquenessErrors,
        )
      );
    }
    return;

    async function getUniquessErrorFields(user: User): Array<string> {

      const orClause: Array<{}> = [];
      that.uniqueFields.forEach(field => {
        if (user[field] != null) {
          orClause.push({
            content: { $eq: user[field] },
            streamIds: SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(field),
            deleted: null,
            headId: null,
          });
        }
      });

      if (orClause.length === 0) return {};

      const query: {} = { $or: orClause };
      
      const duplicateEvents: ?Array<Object> = await bluebird.fromCallback(
        cb => that.eventsStorage.find(
          that.collectionInfo,
          that.eventsStorage.applyQueryToDB(query),
          that.eventsStorage.applyOptionsToDB(null),
          cb,
        ),
      );
      if (duplicateEvents != null && duplicateEvents.length > 0) {
        const uniquenessErrors = {};
        duplicateEvents.forEach(
          duplicate => {
            const key = extractDuplicateField(
              that.uniqueFields,
              duplicate.streamIds,
            );
            uniquenessErrors[key] = user[key];
          },
        );
        return uniquenessErrors;
      }
      return {};
    

      function extractDuplicateField(streamIdsWithoutPrefix, streamIdsWithPrefix): string {
        const intersection: Array<string> = streamIdsWithoutPrefix.filter(streamIdWithoutPrefix => 
          streamIdsWithPrefix.includes(SystemStreamsSerializer.addCorrectPrefixToAccountStreamId(streamIdWithoutPrefix))
        )
        return intersection[0];
      }
    }
  }
}

/**
   * Get object with transaction options
   */
function getTransactionOptions() {
  return {
    readPreference: 'primary',
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' },
  };
}

/**
 * Get user password hash
 * @param string userId 
 */
async function getUserPasswordHash(userId: string, storage: any): Promise<?string> {
  const userPass: Event = await bluebird.fromCallback(cb =>
    storage.findOne({ id: userId },
      {
        $and: [
          { streamIds: SystemStreamsSerializer.options.STREAM_ID_PASSWORDHASH }
        ]
      }, null, cb));
  return (userPass?.content != null) ? userPass.content : null;
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
