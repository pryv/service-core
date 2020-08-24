/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');

const Repository = require('./repository');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

class User {
  id: string;
  username: string;
  repository: ?Repository;

  constructor (params: {
    id?: string,
    username?: string,
    //storage,//TODO IEVA -events storage 
  }) {
    this.id = params?.id;
    this.username = params?.username;
    if (params.storage == null) {
      throw new Error('events storage is not set for User object.');
    }
    this.repository = new Repository(params.storage);
    this.user = { id: params?.id };
  }

  async getUserIdByUsername () {
    if (!this.id && this.username) {
      this.id = await this.repository.getUserIdByUsername(this.username);
      if (this.id) {
        this.user = { id: this.id };
      }
    }
  }

  /**
   * Get All users
   * (Used for testing and for the nighty job to make each user structure 
   * compatible with a previous account structure and it is implemented in 
   * inefficiant way)
   */
  async get (): Promise<void> {
    return await this.repository.get();
  }

/**
 * Get All usernames
 * Does the same as this.get(), just retrieves only usernames and ids.
 * Used for the webhooks
 */
  async getAllUsernames (): Promise<void> {
    return await this.repository.getAllUsernames();
  }

  /**
   * User object
   * @param Boolean shouldReturnUserId
   * @param Boolean shouldReturnAllInfo
   */
  async getUserInfo (shouldReturnUserId: Boolean, shouldReturnAllInfo: Boolean): Promise<void> {
    // set default values
    if (typeof shouldReturnAllInfo === 'undefined') {
      shouldReturnAllInfo = false;
    }
    if (typeof shouldReturnUserId === 'undefined') {
      shouldReturnUserId = false;
    }
    // if user is not found, as before , just return null
    try {
      await this._checkForUserId();
    } catch (err) {
      return null;
    }

    try{
      let user = await this.repository.getById({ id: this.id }, shouldReturnAllInfo);
      if (user && shouldReturnUserId === true) {
        user.id = this.id;
      }
      return user;
    } catch (err) {
      throw err;
    }
  }

  async _checkForUserId () {
    // get userId if only username was used to initialize the class
    await this.getUserIdByUsername();
    if (!this.id) {
      throw new Error('No such user');
    }
  }

  async save (params): Promise<void> {
    return await this.repository.insertOne(params);
  }

  async update (fieldsToUpdate: {}): Promise<void> {
    /*
    const fields = Object.keys(fieldsToUpdate);
    _.merge(this, fieldsToUpdate);
    await makeUpdate(fields, this);
    */
    try {
      await this._checkForUserId();
      const updatedUser = await this.repository.updateOne(this.id, fieldsToUpdate);
      return updatedUser;
    } catch (err) {
      throw err;
    }
  }

  async delete (): Promise<void> {
    // TODO IEVA left for implementation with user deletion feature
    return await this.repository.deleteMany(this.id);
  }

  async getUserPasswordHash (): Promise<void> {
    return await this.repository.getUserPasswordHash(this.id);
  }

  /**
   * Check each provided field if it should be unique in the local db
   * and if it has a unique value
   * @param {*} fields 
   */
  async checkUserFieldsUniqueness (fields): Promise<void> {
    if (!fields || typeof fields !== 'object') {
      throw new Error('Please provide fields to checkUserFieldsUniqueness');
    }
    const systemStreamsSerializerObj = new SystemStreamsSerializer();
    const uniqueStreamsIds = systemStreamsSerializerObj.getUniqueAccountStreamsIds();

    const uniqueFields = Object.keys(fields)
      .filter(key => uniqueStreamsIds.includes(key))
      .reduce((obj, key) => {
        obj[key] = fields[key];
        return obj;
      }, {});

    return await this.repository.checkUserFieldsUniqueness(uniqueFields);
  }
}
module.exports = User;