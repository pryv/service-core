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

const treeUtils = require('components/utils/src/treeUtils');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

const getConfig: () => Config = require('components/api-server/config/Config')
  .getConfig;
import type { Config } from 'components/api-server/config/Config';
const config: Config = getConfig();
//const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

class User {
  userId: ?string; // to remove

  id: ?string;
  username: ?string;
  email: ?string;
  language: ?string;

  events: ?Array<{}>;
  apiEndpoint: ?string;
  systemStreamsSerializer: ?SystemStreamsSerializer;
  accountStreamsSettings: ?Array<{}>;
  accountFields: ?Array<string> = [];

  constructor(params: {
    systemStreamsSerializer: {},
    events?: Array<{}>, 
    userId?: string, 
    id?: string,
    username?: string,
    email?: string,
    language?: string,
    appId?: string,
    invitationToken?: string,
    passwordHash?: string,
    referer?: string,
    dbDocuments?: number,
    attachedFiles: number,
  }) {
    //this.serializer = new SystemStreamsSerializer();
    this.events = params.events;
    this.userId = params.userId;
    this.systemStreamsSerializer = params.systemStreamsSerializer;
    this.accountStreamsSettings = config.get('systemStreams:account');
    this.createIdIfMissing();
    buildAccountFields(this);
    loadAccountData(this);
    if (this.events != null) formAccountDataFromListOfEvents(this);
  }

  createIdIfMissing() {
    if (this.userId == null) this.userId = cuid();
    if (this.id == null) this.id = cuid();
  }

  getEvents(): Array<{}> {
    if (this.events != null) return this.events;

    buildEventsFromAccount(this);
    return this.events;
  }

  getAccount() {
    return _.pick(this, this.accountFields);
  }

  getAccountWithId() {
    return _.pick(this, _.concat(this.accountFields, ['id']));
  }

  getApiEndpoint() {
    if (this.apiEndpoint != null) return this.apiEndpoint;
    const apiFormat = config.get('service:api');
    this.apiEndpoint = apiFormat.replace('{username}', this.username);
    return this.apiEndpoint;
  }
}

function buildAccountFields(user: User): void {
  const userAccountStreams = user.systemStreamsSerializer.getAllAccountStreamsLeafs();
  userAccountStreams.forEach(stream => {
    user.accountFields.push(stream.id);
  });
}

function loadAccountData(user: User, params): void {
  this.accountFields.forEach(field => {
    if (params[field] != null) user[field] = params[field];
  });
}

function buildEventsFromAccount(user: User): Array<{}> {
  const userAccountStreams = user.systemStreamsSerializer.getAllAccountStreamsLeafs();
  // convert to events
  const account = user.getAccount();

  const events = [];
  Object.keys(userAccountStreams).forEach(streamId => {
    if (
      account[streamId] ||
      typeof userAccountStreams[streamId].default != null
    ) {
      let parameter = userAccountStreams[streamId].default;

      // set default value if undefined
      if (typeof account[streamId] !== 'undefined') {
        parameter = account[streamId];
      }

      const event = createEvent(
        user,
        streamId,
        parameter,
        userAccountStreams
      );

      events.push(event);
    }
  });

  // flatten them
  return events;
}

function createEvent(user, streamId, accountParameter, userAccountStreams) {
  const defaultAccessId = 'system';

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
    createdBy: defaultAccessId,
    modifiedBy: defaultAccessId,
    attachements: [],
    tags: []
  };

  // if fields has to be unique , add stream id and the field that enforces uniqueness
  if (userAccountStreams[streamId].isUnique === true) {
    event.streamIds.push(
      SystemStreamsSerializer.options.STREAM_ID_UNIQUE
    );
    // repeated field for uniqness
    event[streamId + '__unique'] = accountParameter;
  }
  return event;
}

/**
 * Convert system->account events to the account object
 */
function formAccountDataFromListOfEvents(user: User) {
  const account = formEventsTree(user.accountStreamsSettings, user.events, {});
  user.id = user.userId;
}

/**
 * Takes the list of the streams, events list
 * and object where events will be saved in a tree structure
 * @param object streams
 * @param array events
 * @param object user
 */
function formEventsTree(streams: {}, events: Array<{}>, user: {}): {} {
  let streamIndex;
  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const streamName = streams[streamIndex].id;

    // if stream has children recursivelly call the same function
    if (typeof streams[streamIndex].children !== 'undefined') {
      user[streamName] = {};
      user[streamName] = formEventsTree(
        streams[streamIndex].children,
        events,
        user[streamName]
      );
    }

    // get value for the stream element
    for (let i = 0; i < events.length; i++) {
      if (events[i].streamIds.includes(streamName)) {
        user[streamName] = events[i].content;
        break;
      }
    }
  }
  return user;
}

module.exports = User;
