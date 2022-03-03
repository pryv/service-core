/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store.
 * Events implementation
 */

const bluebird = require('bluebird');
const _ = require('lodash');
const Readable = require('stream').Readable;

const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');

const {DataStore, errors}  = require('pryv-datastore');
const handleDuplicateError = require('../Database').handleDuplicateError;

const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds
class LocalUserEvents extends DataStore.UserEvents {
  eventsCollection: any;
  eventsFileStorage: any;

  constructor(eventsCollection: any, eventsFileStorage: any) {
    super();
    this.eventsCollection = eventsCollection;
    this.eventsFileStorage = eventsFileStorage;
  }

  async update(userId, eventData, transaction) {
    try {
      const update = Object.assign({}, eventData);
      update._id = update.id;
      update.userId = userId;
      delete update.id;

      const query = {userId: userId, _id: update._id};
      const options = {transactionSession: transaction?.transactionSession };
      
      const res = await this.eventsCollection.replaceOne(query, update, options);
      const res2 = await this.eventsCollection.findOne({userId: userId, _id: update._id});
      return (res.modifiedCount === 1); // true if an event was updated
    } catch (err) {
      throw errors.unexpectedError(err);
    }
  }

  async create(userId, event, transaction) {
    try {
      const options = { transactionSession: transaction?.transactionSession };
      const toInsert = _.cloneDeep(event);
      toInsert.userId = userId;
      toInsert._id = event.id;
      delete toInsert.id;
      const res =  await this.eventsCollection.insertOne(toInsert, options);
      return event;
    } catch (err) {
      handleDuplicateError(err);
      if (err.isDuplicateIndex != null && err.isDuplicateIndex('_id')) {
        throw errors.itemAlreadyExists('event', {id: event.id}, err);
      }
      throw errors.unexpectedError(err);
    }
  }

  async createWithAttachments(userId: string, partialEventData: {}, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction): Promise<void> {
    const attachmentsResponse = [];
    
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, partialEventData.id);
      attachmentsResponse.push({id: fileId});
    }
    const eventData = await finalizeEventCallBack(attachmentsResponse);
    return await this.create(userId, eventData, transaction);
  }

  _getCursor(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    query.userId = userId;
    const queryOptions = { projection: options.projection};
    let cursor = this.eventsCollection.find(query, queryOptions).sort(options.sort);
    if (options.skip != null) { cursor = cursor.skip(options.skip); }
    if (options.limit != null) { cursor = cursor.limit(options.limit); }
    return cursor;
  }

  async getStreamed(userId, params) {
    const cursor = this._getCursor(userId, params);
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
  }

  async get(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    const cursor = this._getCursor(userId, params);
    const res = (await cursor.toArray()).map((value) => cleanResult({value}));
    return res;
  }

  async delete(userId, params, transaction) {
    const {query, options} = paramsToMongoquery(params);
    query.userId = userId;
    options.transactionSession = transaction?.transactionSession;
    return await this.eventsCollection.deleteMany(query, options);
  }

  // ----------------- attachments ----------------- //
  async attachmentAdd(userId: string, partialEventData: {}, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction) {
    const attachmentsResponse = [];
    
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, partialEventData.id);
      attachmentsResponse.push({id: fileId});
    }
    const eventData = await finalizeEventCallBack(attachmentsResponse);
    return await this.update(userId, eventData, {}, transaction);
  }

  async _deleteUser(userId: string): Promise<void> {
    const query = {userId};
    return await this.eventsCollection.deleteMany(query, {});
  }

  async _storageUsedForUser(userId: string) { 
    return await (await this.eventsCollection.find({userId})).count();
  }
}

module.exports = LocalUserEvents;

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
  return value
}

/**
 * transform params to mongoQuery 
 * @param {*} requestedType 
 * @returns 
 */
function paramsToMongoquery(params) {
  const options = {
    projection: params.returnOnlyIds ? {id: 1} : {},
    sort: { time: params.sortAscending ? 1 : -1 },
    skip: params.skip,
    limit: params.limit
  };


  const query = {};

  // trashed
  switch (params.state) {
    case 'trashed':
      query.trashed = true;
      break;
    case 'all':
      break;
    default:
      query.trashed = false;
  }

  // all deletions (tests only)
  if (! params.includeDeletions) {
    query.deleted = null;
  }

  // onlyDeletions
  if (params.deletedSince != null) {
    query.deleted = {$gt: params.deletedSince};
    options.sort = {deleted: -1};
  }

  // if getOne
  if (params.id != null) {
    query._id = params.id;
  }

  // history
  if (params.headId) { // I don't like this !! history implementation should not be exposed .. but it's a quick fix for now
    query.headId = params.headId;
  } else {
    if (! params.includeHistory) { // no history;
      query.headId = null;
    } else {
      if (params.id != null) { // get event and history of event
        query.$or = [{_id: params.id}, {headId: params.id}];
        delete query._id;
      }
      // if query.headId is undefined all history (in scope) will be returned
      options.sort.modified = 1; // also sort by modified time when history is requested
    }
  }
 
  // if streams are defined
  if (params.streams != null && params.streams.length != 0) {
    const streamsQuery = streamsQueryUtils.toMongoDBQuery(params.streams);
    
    if (streamsQuery.$or) query.$or = streamsQuery.$or;
    if (streamsQuery.streamIds) query.streamIds = streamsQuery.streamIds;
    if (streamsQuery.$and) query.$and = streamsQuery.$and;
  }

  if (params.types && params.types.length > 0) {
    // unofficially accept wildcard for sub-type parts
    const types = params.types.map(getTypeQueryValue);
    query.type = {$in: types};
  }
  if (params.fromTime != null) {
    const timeQuery = [
      { // Event started before fromTime, but finished inside from->to.
        time: {$lt: params.fromTime},
        endTime: {$gte: params.fromTime}
      }
    ];
    if (params.toTime != null) {
      timeQuery.push({ // Event has started inside the interval.
        time: { $gte: params.fromTime, $lte: params.toTime }
      });
    }
    
    if (params.toTime == null || ( params.toTime + DELTA_TO_CONSIDER_IS_NOW) > (Date.now() / 1000)) { // toTime is null or greater than now();
      params.running = true;
    }

    if (query.$or) { // mongo support only one $or .. so we nest them into a $and
      if (! query.$and) query.$and = [];
      query.$and.push({$or: query.$or});
      query.$and.push({$or: timeQuery});
      delete query.$or; // clean; 
    } else {
      query.$or = timeQuery;
    }

  }
  if (params.toTime != null) {
    _.defaults(query, {time: {}});
    query.time.$lte = params.toTime;
  }
  if (params.modifiedSince != null) {
    query.modified = {$gt: params.modifiedSince};
  }
  if (params.running) {
    if (query.$or) { 
      query.$or.push({endTime: null})
    } else {
      query.endTime = null; // matches when duration exists and is null
    }
  }

  // excludes. (only supported for ID.. specific to one updateEvent in SystemsStream .. might be removed)
  if (params.NOT != null) {
    if (params.NOT.id != null) {
      if (query._id != null) throw new Error('NOT.id is not supported with id');
      query._id = {$ne: params.NOT.id};
    }
  }
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

