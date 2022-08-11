/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const _ = require('lodash');
const Readable = require('stream').Readable;

const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');

const ds = require('pryv-datastore');
const errors = ds.errors;
const handleDuplicateError = require('../Database').handleDuplicateError;

/**
 * Local data store: events implementation.
 */
module.exports = (ds.createUserEvents({
  eventsCollection: null,
  eventsFileStorage: null,

  init (eventsCollection: any, eventsFileStorage: any) {
    this.eventsCollection = eventsCollection;
    this.eventsFileStorage = eventsFileStorage;
  },

  async get(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    const cursor = this._getCursor(userId, query, options);
    const res = (await cursor.toArray()).map((value) => cleanResult({value}));
    return res;
  },

  async getStreamed(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    const cursor = this._getCursor(userId, query, options);
    // streaming with backpressure - highWaterMark has really some effect
    const readableUnderPressure = new Readable({objectMode: true, highWaterMark: 4000});
    readableUnderPressure._read = async () => {
      try {
        let push = true;
        while (push) {
          if (! await cursor.hasNext()) { readableUnderPressure.push(null); break; } // stop
          const value = await cursor.next();
          push = readableUnderPressure.push(cleanResult({value})); // if null reader is "full"
        }
      } catch (err) {
        readableUnderPressure.emit('error', err);
      }
    };
    return readableUnderPressure;
  },

  async create(userId, event, transaction) {
    try {
      const options = { transactionSession: transaction?.transactionSession };
      const toInsert = _.cloneDeep(event);
      toInsert.userId = userId;
      toInsert._id = event.id;
      delete toInsert.id;
      await this.eventsCollection.insertOne(toInsert, options);
      return event;
    } catch (err) {
      handleDuplicateError(err);
      if (err.isDuplicateIndex != null && err.isDuplicateIndex('_id')) {
        throw errors.itemAlreadyExists('event', {id: event.id}, err);
      }
      throw errors.unexpectedError(err);
    }
  },

  async saveAttachedFiles(userId: string, eventId, attachmentsItems: Array<AttachmentItem>, transaction?: Transaction) {
    const attachmentsResponse = [];
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, eventId);
      attachmentsResponse.push({id: fileId});
    }
    return attachmentsResponse;
  },

  async getAttachedFile (userId: string, eventId, fileId: string) {
    return this.eventsFileStorage.getAttachedFileStream(userId, eventId, fileId);
  },

  async deleteAttachedFile(userId: string, eventId, fileId: string, transaction?: Transaction) {
    return await this.eventsFileStorage.removeAttachedFile(userId, eventId, fileId);
  },

  async update(userId, eventData, transaction) {
    try {
      const update = Object.assign({}, eventData);
      update._id = update.id;
      update.userId = userId;
      delete update.id;

      const query = {userId: userId, _id: update._id};
      const options = {transactionSession: transaction?.transactionSession };

      const res = await this.eventsCollection.replaceOne(query, update, options);
      await this.eventsCollection.findOne({userId: userId, _id: update._id});
      return (res.modifiedCount === 1); // true if an event was updated
    } catch (err) {
      throw errors.unexpectedError(err);
    }
  },

  async delete(userId, params, transaction) {
    const {query, options} = paramsToMongoquery(params);
    query.userId = userId;
    options.transactionSession = transaction?.transactionSession;

    // logic might be adapated, but in case of delete the attachments are removed by the store
    const queryForAttachments = _.clone(query);
    queryForAttachments.attachments = {$exists: true, $ne: []};
    const eventsWithAttachments = await this._getCursor(userId, queryForAttachments, options).toArray();
    for (const eventWithAttachment of eventsWithAttachments) {
      await this.eventsFileStorage.removeAllForEvent(userId, eventWithAttachment._id);
    }

    return await this.eventsCollection.deleteMany(query, options);
  },

  _getCursor(userId, query, options) {
    query.userId = userId;
    const queryOptions = { projection: options.projection};
    let cursor = this.eventsCollection.find(query, queryOptions).sort(options.sort);
    if (options.skip != null) { cursor = cursor.skip(options.skip); }
    if (options.limit != null) { cursor = cursor.limit(options.limit); }
    return cursor;
  },

  async _deleteUser(userId: string): Promise<void> {
    const query = {userId};
    const res = await this.eventsCollection.deleteMany(query, {});
    return res;
  },

  async _getUserStorageSize(userId: string) {
    // TODO: fix this total HACK
    return await (await this.eventsCollection.find({userId})).count();
  }
}): any);

//--------------- helpers ------------//

/**
 * change _id to id and remove userId from result
 * @param {any}
 * @returns
 */
function cleanResult(result) {
  if (result?.value == null) return result;
  const value = result.value;
  if (value != null) {
    value.id = value._id;
    delete value._id;
    delete value.userId;
  }
  return value;
}

const converters = {
  equal: (content) => {
    const realfield = (content.field === 'id') ? '_id' : content.field;
    return {[realfield]: {$eq : content.value}};
  },
  greater: (content) => {
    return {[content.field]: {$gt :content.value}};
  },
  greaterOrEqual: (content) => {
    return {[content.field]: {$gte :content.value}};
  },
  lowerOrEqual: (content) => {
    return {[content.field]: {$lte :content.value}};
  },
  greaterOrEqualOrNull: (content) => {
    return { $or: [{ [content.field]: { $gte: content.value } }, { [content.field]: null }] }
  },
  typesList: (list) => {
    if (list.length == 0) return null;
    return {type: {$in: list.map(getTypeQueryValue)}};
  },
  streamsQuery: (content) => {
    return streamsQueryUtils.toMongoDBQuery(content);
  }
};

/**
 * transform params to mongoQuery
 * @param {*} requestedType
 * @returns
 */
function paramsToMongoquery(params) {
  const options = {
    skip: params.options.skip,
    limit: params.options.limit,
    sort: params.options.sort,
  };
  const query = {$and: []};

  for (const item of params.query) {
    const newCondition = converters[item.type](item.content);
    if (newCondition != null) {
      query.$and.push(newCondition);
    }
  }

  if (query.$and.length == 0) delete query.$and; // remove empty $and
  return {query, options};
}

/**
 * Returns the query value to use for the given type, handling possible wildcards.
 *
 * @param {String} requestedType
 */
function getTypeQueryValue(requestedType) {
  var wildcardIndex = requestedType.indexOf('/*');
  return wildcardIndex > 0 ?
    new RegExp('^' + requestedType.substr(0, wildcardIndex + 1)) :
    requestedType;
}
