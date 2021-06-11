/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const treeUtils = require('utils/src/treeUtils');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const UsersRepository = require('business/src/users/repository');

const { getConfigUnsafe } = require('@pryv/boiler');
const { ApiEndpoint , encryption } = require('utils')

const SystemStream = require('business/src/system-streams/SystemStream');
const Event = require('business/src/events/Event');

class User {
  // User properties that exists by default (email could not exist with specific config)
  id: ?string;
  username: ?string;
  email: ?string;
  language: ?string;
  password: ?string;
  accessId: ?string;

  events: ?Array<Event>;
  apiEndpoint: ?string;
  accountFields: Array<string> = [];
  readableAccountFields: Array<string> = [];
  accountFieldsWithPrefix: Array<string> = [];
  uniqueAccountFields: Array<string> = [];

  constructor (params: {
    events?: Array<Event>,
    id?: string,
    username?: string,
    email?: string,
    language?: string,
    appId?: string,
    invitationToken?: string,
    password?: string,
    passwordHash?: string,
    referer?: string,
    dbDocuments?: number,
    attachedFiles: number,
  }) {
    this.events = params.events;
    buildAccountFields(this);
    loadAccountData(this, params);

    if (this.events != null) buildAccountDataFromListOfEvents(this);
    this.createIdIfMissing();
  }

  createIdIfMissing () {
    if (this.id == null) this.id = cuid();
  }

  /**
   * Get list of events from account data
   */
  async getEvents (): Array<{}> {
    if (this.events == null) await buildEventsFromAccount(this);
    return this.events;
  }

  /**
   * Get only readable account information
   */
  getReadableAccount (): {} {
    return _.pick(this, this.readableAccountFields);
  }

  /**
   * Get full account information
   */
  getFullAccount (): {} {
    return _.pick(this, this.accountFields);
  }

  /**
   * Get fields provided by account methods
   */
  getLegacyAccount (): {} {
    return _.pick(this, [
      'username',
      'email',
      'language',
      'storageUsed',
    ]);
  }
  
  /**
   * Get account with id property added to it
   */
  getAccountWithId () {
    return _.pick(this, this.accountFields.concat('id'));
  }

  /**
   * Get account unique fields
   */
  getUniqueFields () {
    return _.pick(this, this.uniqueAccountFields);
  }

  /**
   * Builds apiEndpoint with the token if it exists
   */
  getApiEndpoint () {
    if (! this.apiEndpoint) this.apiEndpoint = this.buildApiEndpoint(this.token);
    return this.apiEndpoint;
  }

  /**
   * Build apiEndPoint for this user and token
   * @param {*} updateData 
   * @param {*} isActive 
   */
  buildApiEndpoint(token) {
    return ApiEndpoint.build(this.username, token);
  }

  /**
   * Build request to service register for data update
   * @param {*} updateData 
   */
  getUpdateRequestToServiceRegister (updateData: {}, isActive: boolean) {
    const updateRequest = {};
    const updateKeys = Object.keys(updateData);
    const editableAccountStreams = SystemStreamsSerializer.getEditableAccountMap();
    
    // iterate over updateData and check which fields should be updated
    updateKeys.forEach(streamIdWithoutPrefix => {
      // check if field value was changed
      if (updateData[streamIdWithoutPrefix] !== this[streamIdWithoutPrefix]){
        const streamIdWithPrefix = SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix);
        updateRequest[streamIdWithoutPrefix] = [{
          value: updateData[streamIdWithoutPrefix],
          isUnique: editableAccountStreams[streamIdWithPrefix].isUnique,
          isActive: isActive,
          creation: false
        }];
      }
    });
    return updateRequest;
  }
  /**
   * 1) Build events for the given updateData
   * @param {*} update
   */
  async getEventsDataForUpdate (update: {}, accessId: string) {
    const uniqueAccountStreamIds = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();

    // change password into hash if it exists
    if (update.password) {
      update.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(update.password, cb));
    }
    delete update.password;

    // Start a transaction session
    const streamIdsForUpdate = Object.keys(update);
    let events = [];

    // update all account streams and don't allow additional properties
    for (let i = 0; i < streamIdsForUpdate.length; i++) {
      let streamIdWithoutPrefix = streamIdsForUpdate[i];
      // if needed append field that enforces uniqueness
      let updateData = {
        content: update[streamIdWithoutPrefix],
        modified: timestamp.now(),
        modifiedBy: accessId
      };
      events.push({
        updateData: updateData,
        streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix)
      });
    }
    return events;
  }
}

function buildAccountFields (user: User): void {
  const userAccountStreamIds = SystemStreamsSerializer.getAccountStreamIdsForUser();
  user.accountFieldsWithPrefix = userAccountStreamIds.accountFieldsWithPrefix;
  user.uniqueAccountFields = userAccountStreamIds.uniqueAccountFields;
  user.readableAccountFields = userAccountStreamIds.readableAccountFields;
  user.accountFields = userAccountStreamIds.accountFields;
}

function loadAccountData (user: User, params): void {
  user.accountFields.forEach(field => {
    if (params[field] != null) user[field] = params[field];
  });
  // temporarily add password because the encryption need to be loded asyncronously
  // and it could not be done in the contructor
  if (params.password && !params.passwordHash) {
    user.password = params.password;
  }
  if (params.id) {
    user.id = params.id;
  }
}

async function buildEventsFromAccount (user: User): Promise<void> {
  const accountLeavesMap: Map<string, SystemStream> = SystemStreamsSerializer.getAccountLeavesMap();
  
  // convert to events
  let account = user.getFullAccount();

  // change password into hash (also allow for tests to pass passwordHash directly)
  if (user.password != null && user.passwordHash == null) {
    account.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(user.password, cb));
  }
  delete user.password;

  // flatten account information
  account = treeUtils.flattenSimpleObject(account); // prolly useless
  const events = [];

  for (const [streamId, stream] of Object.entries(accountLeavesMap)) {

    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    const content: any = account[streamIdWithoutPrefix] ? account[streamIdWithoutPrefix] : stream.default;

    if (content != null) {
      const event = createEvent(
        streamId,
        stream.type,
        stream.isUnique,
        content,
        user.accessId ? user.accessId : UsersRepository.options.SYSTEM_USER_ACCESS_ID,
      );

      events.push(event);
    }
  }

  user.events = events;
}

function createEvent (
  streamId: string,
  type: string,
  isUnique: boolean,
  content: string,
  accessId: string
) {
  const event = {
    id: cuid(),
    streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE], // add active stream id by default
    type,
    content,
    created: timestamp.now(),
    modified: timestamp.now(),
    time: timestamp.now(),
    createdBy: accessId,
    modifiedBy: accessId,
    attachements: [],
    tags: []
  };

  if (isUnique) {
    event.streamIds.push(
      SystemStreamsSerializer.options.STREAM_ID_UNIQUE
    );
  }
  return event;
}

/**
 * Convert system->account events to the account object
 * @param User user
 */
function buildAccountDataFromListOfEvents (user: User) {
  const account = buildAccountRecursive(SystemStreamsSerializer.getAccountChildren(), user.events, {});
  Object.keys(account).forEach(param => {
    user[param] = account[param];
  });
}

/**
 * Takes the list of the streams, events list
 * and object where events will be saved in a tree structure
 * @param object streams
 * @param array events
 * @param object user
 */
function buildAccountRecursive(streams: Array<SystemStream>, events: Array<Event>, user: {}): User {
  let streamIndex;

  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const currentStream: SystemStream = streams[streamIndex];
    const streamIdWithPrefix = currentStream.id;
    const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamIdWithPrefix);

    // if stream has children recursivelly call the same function
    if (Array.isArray(currentStream.children) && currentStream.children.length > 0) {
      user[streamIdWithoutPrefix] = {};
      user[streamIdWithoutPrefix] = buildAccountRecursive(
        currentStream.children,
        events,
        user[streamIdWithoutPrefix]
      );
    }

    // get value for the stream element
    for (let i = 0; i < events.length; i++) {
      if (events[i].streamIds.includes(streamIdWithPrefix)) {
        user[streamIdWithoutPrefix] = events[i].content;
        break;
      }
    }
  }
  return user;
}

module.exports = User;
