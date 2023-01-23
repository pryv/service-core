/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const Readable = require('stream').Readable;
const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');
const ds = require('@pryv/datastore');
const errors = ds.errors;
const handleDuplicateError = require('../Database').handleDuplicateError;

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const DELETION_MODES_FIELDS = require('../eventsDeletionsModes');
const { integrity } = require('business');
/**
 * Local data store: events implementation.
 */
module.exports = ds.createUserEvents({
  eventsCollection: null,
  eventsFileStorage: null,
  deletionSettings: {
    mode: null,
    fields: null,
    removeAttachments: true,
    updateOperatorForHistory: { $unset: {} }
  },

  init (eventsCollection, eventsFileStorage) {
    this.eventsCollection = eventsCollection;
    this.eventsFileStorage = eventsFileStorage;

    // prepare deletion settings
    this.deletionSettings.mode = this.settings.versioning?.deletionMode || 'keep-nothing';
    this.deletionSettings.fields = DELETION_MODES_FIELDS[this.deletionSettings.mode] || ['integrity'];
    for (const field of this.deletionSettings.fields) {
      this.deletionSettings.updateOperatorForHistory.$unset[field] = '';
    }
    this.deletionSettings.removeAttachments = this.deletionSettings.updateOperatorForHistory.$unset.attachments != null;
    this.keepHistory = this.settings.versioning?.forceKeepHistory || false;
  },

  async getOne (userId, eventId) {
    const cursor = this._getCursor(userId, { _id: eventId }, {});
    const res = (await cursor.toArray()).map((value) => cleanResult({ value }));
    return res[0];
  },

  async get (userId, params) {
    const { query, options } = paramsToMongoquery(params);
    const cursor = this._getCursor(userId, query, options);
    const res = (await cursor.toArray()).map((value) => cleanResult({ value }));
    return res;
  },

  async getStreamed (userId, params) {
    const { query, options } = paramsToMongoquery(params);
    const cursor = this._getCursor(userId, query, options);
    return readableStreamFromEventCursor(cursor);
  },

  /**
   * @param {identifier} userId
   * @param {timestamp} deletedSince
   * @param {number} [limit]
   * @param {number} [skip]
   * @param {boolean} [sortAscending]
   * @returns {Promise<Readable>}
   */
  async getDeletionsStreamed (userId, deletedSince, limit = null, skip = null, sortAscending = false) {
    const query = { deleted: { $gt: deletedSince } };
    const options = { sort: { deleted: sortAscending ? 1 : -1 } };
    if (skip != null) options.skip = skip;
    if (limit != null) options.limit = limit;
    const cursor = this._getCursor(userId, query, options);
    return readableStreamFromEventCursor(cursor);
  },

  async getHistory (userId, eventId) {
    const options = { sort: { modified: 1 } };
    const cursor = this._getCursor(userId, { headId: eventId }, options);
    const res = (await cursor.toArray()).map((value) => cleanHistoryResult({ value }));
    return res;
  },

  async create (userId, event, transaction) {
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
        throw errors.itemAlreadyExists('event', { id: event.id }, err);
      }
      throw errors.unexpectedError(err);
    }
  },
  async saveAttachedFiles (userId, eventId, attachmentsItems, transaction) {
    const attachmentsResponse = [];
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, eventId);
      attachmentsResponse.push({ id: fileId });
    }
    return attachmentsResponse;
  },
  async getAttachedFile (userId, eventId, fileId) {
    return this.eventsFileStorage.getAttachedFileStream(userId, eventId, fileId);
  },
  async deleteAttachedFile (userId, eventId, fileId, transaction) {
    return await this.eventsFileStorage.removeAttachedFile(userId, eventId, fileId);
  },
  async update (userId, eventData, transaction) {
    const update = Object.assign({}, eventData);
    update._id = update.id;
    update.userId = userId;
    delete update.id;
    const query = { userId, _id: update._id };
    const options = { transactionSession: transaction?.transactionSession };
    try {
      await this._generateVersionIfNeeded(userId, update._id, null, transaction);
      const res = await this.eventsCollection.replaceOne(query, update, options);
      return res.modifiedCount === 1; // true if an event was updated
    } catch (err) {
      throw errors.unexpectedError(err);
    }
  },

  async delete (userId, originalEvent) {
    const deletedEventContent = Object.assign({}, originalEvent);
    await this._generateVersionIfNeeded(userId, originalEvent.id, originalEvent);
    // if attachments are to be deleted
    if (this.deletionSettings.removeAttachments && deletedEventContent.attachments != null && deletedEventContent.attachments.length > 0) {
      await this.eventsFileStorage.removeAllForEvent(userId, deletedEventContent.id);
    }
    // eventually delete or update history
    if (this.deletionSettings.mode === 'keep-nothing') await this._deleteHistory(userId, deletedEventContent.id);
    if (this.deletionSettings.mode === 'keep-authors') {
      await this.eventsCollection.updateMany(
        { userId, headId: deletedEventContent.id },
        this.deletionSettings.updateOperatorForHistory, {});
    }

    // prepare event content for mongodb
    deletedEventContent.deleted = Date.now() / 1000;
    for (const field of this.deletionSettings.fields) {
      delete deletedEventContent[field];
    }
    integrity.events.set(deletedEventContent);
    deletedEventContent._id = deletedEventContent.id;
    delete deletedEventContent.id;
    deletedEventContent.userId = userId;
    await this.eventsCollection.replaceOne({ userId, _id: deletedEventContent._id }, deletedEventContent);
  },

  async _deleteHistory (userId, eventId) {
    const options = { sort: { modified: 1 } };
    const query = { userId: userId, headId: eventId };
    return await this.eventsCollection.deleteMany(query, options);
  },

  async _generateVersionIfNeeded (userId, eventId, originalEvent = null, transaction = null) {
    if (!this.keepHistory) return;
    const query = { userId, _id: eventId };
    const options = { transactionSession: transaction?.transactionSession };
    let versionItem = null;
    if (originalEvent != null) {
      versionItem = Object.assign({}, originalEvent);
      delete versionItem.id;
    } else {
      versionItem = await this.eventsCollection.findOne(query, options);
      delete versionItem._id;
    }
    versionItem.headId = eventId;
    await this.eventsCollection.insertOne(versionItem);
  },

  _getCursor (userId, query, options) {
    query.userId = userId;
    const queryOptions = { projection: options.projection };
    let cursor = this.eventsCollection
      .find(query, queryOptions)
      .sort(options.sort);
    if (options.skip != null) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit != null) {
      cursor = cursor.limit(options.limit);
    }
    return cursor;
  },

  async _deleteUser (userId) {
    const query = { userId };
    const res = await this.eventsCollection.deleteMany(query, {});
    return res;
  },

  async _getUserStorageSize (userId) {
    // TODO: fix this total HACK
    return await this.eventsCollection.countDocuments({ userId });
  },

  /**
   * LocalStores Only - as long as SystemStreams are embeded
   */
  async removeAllNonAccountEventsForUser (userId) {
    const allAccountStreamIds = SystemStreamsSerializer.getAccountStreamIds();
    const query = { userId, streamIds: { $nin: allAccountStreamIds } };
    const res = await this.eventsCollection.deleteMany(query, {});
    return res;
  }
});
// --------------- helpers ------------//

/**
 * change _id to id, remove userId, from result
 * @param {any} result
 * @returns {any}
 */
function cleanResult (result) {
  if (result?.value == null) { return result; }
  const value = result.value;
  if (value != null) {
    value.id = value._id;
    delete value._id;
    delete value.userId;
  }
  return value;
}

/**
 * change remove _id to set id to headId, from result
 * @param {any} result
 * @returns {any}
 */
function cleanHistoryResult (result) {
  if (result?.value == null) { return result; }
  const value = result.value;
  if (value != null) {
    value.id = value.headId;
    delete value._id;
    delete value.userId;
    delete value.headId;
  }
  return value;
}

const converters = {
  equal: (content) => {
    const realfield = content.field === 'id' ? '_id' : content.field;
    return { [realfield]: { $eq: content.value } };
  },
  greater: (content) => {
    return { [content.field]: { $gt: content.value } };
  },
  greaterOrEqual: (content) => {
    return { [content.field]: { $gte: content.value } };
  },
  lowerOrEqual: (content) => {
    return { [content.field]: { $lte: content.value } };
  },
  greaterOrEqualOrNull: (content) => {
    return {
      $or: [
        { [content.field]: { $gte: content.value } },
        { [content.field]: null }
      ]
    };
  },
  typesList: (list) => {
    if (list.length === 0) { return null; }
    return { type: { $in: list.map(getTypeQueryValue) } };
  },
  streamsQuery: (content) => {
    return streamsQueryUtils.toMongoDBQuery(content);
  }
};
/**
 * transform params to mongoQuery
 * @param {*} requestedType
 * @returns {{ query: { $and: any[]; }; options: { skip: any; limit: any; sort: any; }; }}
 */
function paramsToMongoquery (params) {
  const options = {
    skip: params.options.skip,
    limit: params.options.limit,
    sort: params.options.sort
  };
  const query = { $and: [] };
  for (const item of params.query) {
    const newCondition = converters[item.type](item.content);
    if (newCondition != null) {
      query.$and.push(newCondition);
    }
  }
  if (query.$and.length === 0) { delete query.$and; } // remove empty $and
  return { query, options };
}
/**
 * Returns the query value to use for the given type, handling possible wildcards.
 *
 * @param {String} requestedType
 * @returns {any}
 */
function getTypeQueryValue (requestedType) {
  const wildcardIndex = requestedType.indexOf('/*');
  return wildcardIndex > 0
    ? new RegExp('^' + requestedType.substr(0, wildcardIndex + 1))
    : requestedType;
}

/**
 * Get a readable stream from a cursor
 * @param {Cursor} cursor
 */
function readableStreamFromEventCursor (cursor) {
  // streaming with backpressure - highWaterMark has really some effect "4000" seems to be an optimnal value
  const readableUnderPressure = new Readable({
    objectMode: true,
    highWaterMark: 4000
  });
  let performingReadRequest = false;
  readableUnderPressure._read = async () => {
    if (performingReadRequest) { return; } // avoid starting a 2nd read request when already pushing.
    performingReadRequest = true;
    try {
      let push = true;
      while (push) {
        if (!(await cursor.hasNext())) {
          readableUnderPressure.push(null);
          break;
        } // stop
        const value = await cursor.next();
        push = readableUnderPressure.push(cleanResult({ value })); // if null reader is "full" (handle back pressure)
      }
      performingReadRequest = false;
    } catch (err) {
      readableUnderPressure.emit('error', err);
    }
  };
  return readableUnderPressure;
}
