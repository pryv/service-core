/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const UserRepositoryOptions = require('./UserRepositoryOptions');

const { encryption } = require('utils');

import type { SystemStream } from 'business/src/system-streams';
import type { Event } from 'business/src/events';

class User {
  // User properties that exists by default (email could not exist with specific config)
  id: ?string;
  username: ?string;
  email: ?string;
  language: ?string;
  password: ?string;
  accessId: ?string;

  events: ?Array<Event>;
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
    referer?: string,
  }) {
    this.username = params.username;
    buildAccountFields(this);
    loadAccountData(this, params);

    if (params.events != null) this.events = buildAccountDataFromListOfEvents(this, params.events);
    this.createIdIfMissing();
  }

  createIdIfMissing () {
    if (this.id == null) this.id = cuid();
  }

  /**
   * Get list of events from account data
   */
  async getEvents (): Array<Event> {
    if (this.events == null) this.events = await buildEventsFromAccount(this);
    return this.events;
  }

  /**
   * Get only readable account information
   */
  getReadableAccount (): {} {
    return _.pick(this, this.readableAccountFields.filter(x => x !== 'dbDocuments' && x != 'attachedFiles'));
  }

  /**
   * Get full account information
   */
  getFullAccount (): {} {
    return _.pick(this, this.accountFields.filter(x => x !== 'dbDocuments' && x != 'attachedFiles'));
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
    const res = _.pick(this, this.accountFields.concat('id').filter(x => x !== 'dbDocuments' && x != 'attachedFiles'));
    res.username = this.username;
    return res;
  }

  /**
   * Get account unique fields
   */
  getUniqueFields () {
    return _.pick(this, this.uniqueAccountFields);
  }

  get dbDocuments() {
    console.log('XXXXX > dbDocuments', new Error());
  }
  set dbDocuments(x) {
    console.log('XXXXX set dbDocuments', new Error());
  }
  get attachedFiles() {
    console.log('XXXXX get attachedFiles', new Error());
  }
  set attachedFiles(x) {
    console.log('XXXXX set attachedFiles', new Error());
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
    if (field === 'dbDocuments' || field === 'attachedFiles') {
      //console.log('XXXXXX loadAccountData > Ignoring', field);
    } else {
      if (params[field] != null) user[field] = params[field];
    }
  });
  // temporarily add password because the encryption need to be loded asyncronously
  // and it could not be done in the contructor
  if (params.password ) {
    user.password = params.password;
  }
  if (params.id) {
    user.id = params.id;
  }
}

async function buildEventsFromAccount (user: User): Promise<Array<Event>> {
  const accountLeavesMap: Map<string, SystemStream> = SystemStreamsSerializer.getAccountLeavesMap();

  // convert to events
  const account: {} = user.getFullAccount();

  const events: Array<Event> = [];
  for (const [streamId, stream] of Object.entries(accountLeavesMap)) {

    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    const content: string = account[streamIdWithoutPrefix] ? account[streamIdWithoutPrefix] : stream.default;

    if (content != null) {
      const event = createEvent(
        streamId,
        stream.type,
        stream.isUnique,
        content,
        user.accessId ? user.accessId : UserRepositoryOptions.SYSTEM_USER_ACCESS_ID,
      );

      events.push(event);
    }
  }

  return events;
}

function createEvent (
  streamId: string,
  type: string,
  isUnique: boolean,
  content: string,
  accessId: string
): Event {
  const event: Event = {
    id: cuid(),
    streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE], // add active stream id by default
    type,
    content,
    created: timestamp.now(),
    modified: timestamp.now(),
    time: timestamp.now(),
    createdBy: accessId,
    modifiedBy: accessId,
    attachments: [],
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
 * Assign events data to user account fields
 */
function buildAccountDataFromListOfEvents(user: User, events: Array<Event>): Array<Event> {
  const account = buildAccountRecursive(SystemStreamsSerializer.getAccountChildren(), events, {});
  Object.keys(account).forEach(param => {
    user[param] = account[param];
  });
  return events;
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
