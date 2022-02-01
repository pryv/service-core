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

const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');

const {DataStore, errors}  = require('pryv-datastore');

const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds
class LocalUserEvents extends DataStore.UserEvents {
  userEventsStorage: any;

  constructor(userEventsStorage: any) {
    super();
    this.userEventsStorage = userEventsStorage;
  }

  async create(userId, event, transaction) {
    try {
      return await bluebird.fromCallback(cb => this.userEventsStorage.insertOne(userId, event, cb, { transactionSession: transaction?.transactionSession}));
    } catch (err) {
      if (err.isDuplicateIndex != null && err.isDuplicateIndex('id')) {
        throw errors.itemAlreadyExists('event', {id: event.id}, err);
      }
      throw errors.unexpectedError(err);
    }
  }

  async getStreamed(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    return await bluebird.fromCallback(cb => this.userEventsStorage.findStreamed(userId, query, options, cb));
  }

  async get(userId, params) {
    const {query, options} = paramsToMongoquery(params);
    return await bluebird.fromCallback(cb => this.userEventsStorage.findIncludingDeletionsAndVersions(userId, query, options, cb));
  }
}

module.exports = LocalUserEvents;

//--------------- helpers ------------//

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
      query.trashed = null;
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
    query.id = params.id;
  }

  // history
  if (! params.includeHistory) { // no history;
    query.headId = null;
  } else {
    if (params.id != null) { // get event and history of event
      query.$or = [{_id: params.id}, {headId: params.id}];
      delete query.id;
    }
    // if query.headId is undefined all history (in scope) will be returned
    options.sort.modified = 1; // also sort by modified time when history is requested
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

