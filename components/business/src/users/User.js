/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const UserRepositoryOptions = require('./UserRepositoryOptions');

class User {
  // User properties that exists by default (email could not exist with specific config)

  id;

  username;

  email;

  language;

  password;

  accessId;

  events;
  /** @default [] */
  accountFields = [];
  /** @default [] */
  readableAccountFields = [];
  /** @default [] */
  accountFieldsWithPrefix = [];
  /** @default [] */
  uniqueAccountFields = [];
  constructor (params) {
    this.username = params.username;
    buildAccountFields(this);
    loadAccountData(this, params);
    if (params.events != null) { this.events = buildAccountDataFromListOfEvents(this, params.events); }
    this.createIdIfMissing();
  }

  /**
   * @returns {void}
   */
  createIdIfMissing () {
    if (this.id == null) { this.id = cuid(); }
  }

  /**
   * Get list of events from account data
   * @returns {any[]}
   */
  async getEvents () {
    if (this.events == null) { this.events = await buildEventsFromAccount(this); }
    return this.events;
  }

  /**
   * Get only readable account information
   * @returns {{}}
   */
  getReadableAccount () {
    return _.pick(this, this.readableAccountFields.filter((x) => x !== 'dbDocuments' && x !== 'attachedFiles'));
  }

  /**
   * Get full account information
   * @returns {{}}
   */
  getFullAccount () {
    return _.pick(this, this.accountFields.filter((x) => x !== 'dbDocuments' && x !== 'attachedFiles'));
  }

  /**
   * Get fields provided by account methods
   * @returns {{}}
   */
  getLegacyAccount () {
    return _.pick(this, ['username', 'email', 'language', 'storageUsed']);
  }

  /**
   * Get account with id property added to it
   * @returns {any}
   */
  getAccountWithId () {
    const res = _.pick(this, this.accountFields
      .concat('id')
      .filter((x) => x !== 'dbDocuments' && x !== 'attachedFiles'));
    res.username = this.username;
    return res;
  }

  /**
   * Get account unique fields
   * @returns {any}
   */
  getUniqueFields () {
    return _.pick(this, this.uniqueAccountFields);
  }

  get dbDocuments () {
    console.log('XXXXX > dbDocuments', new Error());
  }

  set dbDocuments (x) {
    console.log('XXXXX set dbDocuments', new Error());
  }

  get attachedFiles () {
    console.log('XXXXX get attachedFiles', new Error());
  }

  set attachedFiles (x) {
    console.log('XXXXX set attachedFiles', new Error());
  }
}
/**
 * @param {User} user
 * @returns {void}
 */
function buildAccountFields (user) {
  const userAccountStreamIds = SystemStreamsSerializer.getAccountStreamIdsForUser();
  user.accountFieldsWithPrefix = userAccountStreamIds.accountFieldsWithPrefix;
  user.uniqueAccountFields = userAccountStreamIds.uniqueAccountFields;
  user.readableAccountFields = userAccountStreamIds.readableAccountFields;
  user.accountFields = userAccountStreamIds.accountFields;
}
/**
 * @param {User} user
 * @returns {void}
 */
function loadAccountData (user, params) {
  user.accountFields.forEach((field) => {
    if (field === 'dbDocuments' || field === 'attachedFiles') {
      // console.log('XXXXXX loadAccountData > Ignoring', field);
    } else {
      if (params[field] != null) { user[field] = params[field]; }
    }
  });
  if (params.password) {
    user.password = params.password;
  }
  if (params.id) {
    user.id = params.id;
  }
}
/**
 * @param {User} user
 * @returns {Promise<any[]>}
 */
async function buildEventsFromAccount (user) {
  const accountLeavesMap = SystemStreamsSerializer.getAccountLeavesMap();
  // convert to events
  const account = user.getFullAccount();
  const events = [];
  for (const [streamId, stream] of Object.entries(accountLeavesMap)) {
    const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamId);
    const content = account[streamIdWithoutPrefix]
      ? account[streamIdWithoutPrefix]
      : stream.default;
    if (content != null) {
      const event = createEvent(streamId, stream.type, stream.isUnique, content, user.accessId
        ? user.accessId
        : UserRepositoryOptions.SYSTEM_USER_ACCESS_ID);
      events.push(event);
    }
  }
  return events;
}
/**
 * @param {string} streamId
 * @param {string} type
 * @param {boolean} isUnique
 * @param {string} content
 * @param {string} accessId
 * @returns {any}
 */
function createEvent (streamId, type, isUnique, content, accessId) {
  const event = {
    id: cuid(),
    streamIds: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE],
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
    event.streamIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
  }
  return event;
}
/**
 * Assign events data to user account fields
 * @param {User} user
 * @param {Array<Event>} events
 * @returns {any[]}
 */
function buildAccountDataFromListOfEvents (user, events) {
  const account = buildAccountRecursive(SystemStreamsSerializer.getAccountChildren(), events, {});
  Object.keys(account).forEach((param) => {
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
 * @param {Array<SystemStream>} streams
 * @param {Array<Event>} events
 * @param {{}} user
 * @returns {User}
 */
function buildAccountRecursive (streams, events, user) {
  let streamIndex;
  for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
    const currentStream = streams[streamIndex];
    const streamIdWithPrefix = currentStream.id;
    const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamIdWithPrefix);
    // if stream has children recursivelly call the same function
    if (Array.isArray(currentStream.children) &&
            currentStream.children.length > 0) {
      user[streamIdWithoutPrefix] = {};
      user[streamIdWithoutPrefix] = buildAccountRecursive(currentStream.children, events, user[streamIdWithoutPrefix]);
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
