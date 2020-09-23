/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');
const encryption = require('components/utils').encryption;

const treeUtils = require('components/utils/src/treeUtils');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const UsersRepository = require('components/business/src/users/repository');

const getConfig: () => Config = require('components/api-server/config/Config')
  .getConfig;
import type { Config } from 'components/api-server/config/Config';
const config: Config = getConfig();

class User {
  // User properties that exists by default (email could not exist with specific config)
  id: ?string;
  username: ?string;
  email: ?string;
  language: ?string;

  events: ?Array<{}>;
  apiEndpoint: ?string;
  accountStreamsSettings: ?Array<{}>;
  accountFields: ?Array<string> = [];
  accountFieldsWithDot: ?Array<string> = [];
  uniqueAccountFields: ?Array<string> = [];

  constructor (params: {
    events?: Array<{}>,
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
    this.accountStreamsSettings = config.get('systemStreams:account');
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

  getAccount () {
    return _.pick(this, this.accountFields);
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
    if (this.apiEndpoint != null) return this.apiEndpoint;
    const apiFormat = config.get('service:api');
    this.apiEndpoint = apiFormat.replace('{username}', this.username);
    if (this.token) {
      let endpointElements = this.apiEndpoint.split('//');
      endpointElements[1] = `${this.token}@${endpointElements[1]}`;
      this.apiEndpoint = endpointElements.join('//');
    }
    return this.apiEndpoint;
  }

  /**
   * Build request to service register for data update
   * @param {*} updateData 
   */
  getUpdateRequestToServiceRegister (updateData, isActive) {
    const updateRequest = {};
    const updateKeys = Object.keys(updateData);
    const editableAccountStreams = SystemStreamsSerializer.getEditableAccountStreams();
    
    // iterate over updateData and check which fields should be updated
    updateKeys.forEach(streamIdWithoutDot => {
      // check if field value was changed
      if (updateData[streamIdWithoutDot] !== this[streamIdWithoutDot]){
        let streamIdWithDot = SystemStreamsSerializer.addDotToStreamId(streamIdWithoutDot);
        updateRequest[streamIdWithoutDot] = [{
          value: updateData[streamIdWithoutDot],
          isUnique: editableAccountStreams[streamIdWithDot].isUnique,
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
  async getEventsDataForUpdate (update, accessId) {
    const uniqueAccountStreamIds = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutDot();

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
      let streamIdWithoutDot = streamIdsForUpdate[i];
      // if needed append field that enforces uniqueness
      let updateData = {
        content: update[streamIdWithoutDot],
        modified: timestamp.now(),
        modifiedBy: accessId
      };
      // __unique property is assigned here because update object that is passwed to convertors
      // does not have streamIds info that is needed
      if (uniqueAccountStreamIds.includes(streamIdWithoutDot)) {
        updateData[`${streamIdWithoutDot}__unique`] = update[streamIdWithoutDot];
      }
      events.push({
        updateData: updateData,
        streamId: SystemStreamsSerializer.addDotToStreamId(streamIdWithoutDot)
      });
    }
    return events;
  }
}

function buildAccountFields (user: User): void {
  const userAccountStreams = SystemStreamsSerializer.getAllAccountStreams();
  
  Object.keys(userAccountStreams).forEach(streamId => {
    user.accountFieldsWithDot.push(streamId);
    let streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamId);
    if (userAccountStreams[streamId].isUnique == true) {
      user.uniqueAccountFields.push(streamIdWithoutDot);
    }
    user.accountFields.push(streamIdWithoutDot);
  });
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

async function buildEventsFromAccount (user: User): Array<{}> {
  const userAccountStreams = SystemStreamsSerializer.getAllAccountStreamsLeaves();
  
  // convert to events
  let account = user.getAccount();

  // change password into hash (also allow for tests to pass passwordHash directly)
  if (user.password && !user.passwordHash) {
    account.passwordHash = await bluebird.fromCallback((cb) => encryption.hash(user.password, cb));
  }
  delete user.password;

  // flatten account information
  account = treeUtils.flattenSimpleObject(account);
  const events = [];
  Object.keys(userAccountStreams).forEach(streamId => {
    let streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamId);
    if (
      account[streamIdWithoutDot] ||
      typeof userAccountStreams[streamId].default != 'undefined'
    ) {
      let parameter = userAccountStreams[streamId].default;

      // set default value if undefined
      if (typeof account[streamIdWithoutDot] !== 'undefined') {
        parameter = account[streamIdWithoutDot];
      }

      let accessId = (user.accessId) ? user.accessId : UsersRepository.options.SYSTEM_USER_ACCESS_ID;
      const event = createEvent(
        streamId,
        parameter,
        userAccountStreams,
        accessId
      );

      events.push(event);
    }
  });
  // flatten them
  user.events = events;
}

function createEvent (
  streamId: string,
  accountParameter: string,
  userAccountStreams: array,
  accessId: string
) {
  // get type for the event from the config
  let eventType = 'string';
  if (userAccountStreams[streamId].type) {
    eventType = userAccountStreams[streamId].type;
  }

  // create the event
  const event = {
    // add active stream id by default
    id: cuid(),
    streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
    type: eventType,
    content: accountParameter,
    created: timestamp.now(),
    modified: timestamp.now(),
    time: timestamp.now(),
    createdBy: accessId,
    modifiedBy: accessId,
    attachements: [],
    tags: []
  };

  // if fields has to be unique , add stream id and the field that enforces uniqueness
  if (userAccountStreams[streamId].isUnique === true) {
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
  const account = buildEventsTree(user.accountStreamsSettings, user.events, {});
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
function buildEventsTree (streams: {}, events: Array<{}>, user: {}): {} {
  let streamIndex;

  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const streamIdWithDot = streams[streamIndex].id;
    const streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamIdWithDot);

    // if stream has children recursivelly call the same function
    if (typeof streams[streamIndex].children !== 'undefined') {
      user[streamIdWithoutDot] = {};
      user[streamIdWithoutDot] = buildEventsTree(
        streams[streamIndex].children,
        events,
        user[streamIdWithoutDot]
      );
    }

    // get value for the stream element
    for (let i = 0; i < events.length; i++) {
      if (events[i].streamIds.includes(streamIdWithDot)) {
        user[streamIdWithoutDot] = events[i].content;
        break;
      }
    }
  }
  return user;
}

module.exports = User;
