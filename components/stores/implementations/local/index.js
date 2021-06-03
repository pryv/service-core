/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Local Data Source. 
 */
const bluebird = require('bluebird');
const _ = require('lodash');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');
const querying = require('api-server/src/methods//helpers/querying');
const storage = require('storage');

const {DataSource, UserStreams, UserEvents}  = require('stores/interfaces/DataSource');

const STORE_ID = 'local';
const STORE_NAME = 'Local Store';

let forbiddenStreamIds ;
let userEventsStorage;

class LocalDataSource extends DataSource {
  
  get id() { return STORE_ID; }
  get name() { return STORE_NAME; }

  constructor() {  
    super(); 
    this.settings = {
      attachments: {
        setFileReadToken: true // method/events js will add a readFileToken
      }
    }
  }

  async init() {
    // get config and load approriated data sources componenst;
    this._streams = new LocalUserStreams();
    this._events = new LocalUserEvents();
    forbiddenStreamIds = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading();
    userEventsStorage = (await storage.getStorageLayer()).events;
    return this;
  }

  get streams() { return this._streams; }
  get events() { return this._events; }
}


class LocalUserStreams extends UserStreams {
  async get(uid, params) {
   
  }
}

class LocalUserEvents extends UserEvents {
  async getStreamed(userId, params) {
    const query = querying.noDeletions(querying.applyState({}, params.state));

    const streamsQuery = streamsQueryUtils.toMongoDBQuery(params.streams, forbiddenStreamIds);
    
    if (streamsQuery.$or) query.$or = streamsQuery.$or;
    if (streamsQuery.streamIds) query.streamIds = streamsQuery.streamIds;
    if (streamsQuery.$and) query.$and = streamsQuery.$and;
  
  
    if (params.tags && params.tags.length > 0) {
      query.tags = {$in: params.tags};
    }
    if (params.types && params.types.length > 0) {
      // unofficially accept wildcard for sub-type parts
      const types = params.types.map(getTypeQueryValue);
      query.type = {$in: types};
    }
    if (params.running) {
      query.duration = {'$type' : 10}; // matches when duration exists and is null
    }
    if (params.fromTime != null) {
      const timeQuery = [
        { // Event started before fromTime, but finished inside from->to.
          time: {$lt: params.fromTime},
          endTime: {$gte: params.fromTime}
        },
        { // Event has started inside the interval.
          time: { $gte: params.fromTime, $lte: params.toTime }
        },
      ];

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

    const options = {
      projection: params.returnOnlyIds ? {id: 1} : {},
      sort: { time: params.sortAscending ? 1 : -1 },
      skip: params.skip,
      limit: params.limit
    };
  
    return await bluebird.fromCallback(cb => userEventsStorage.findStreamed(userId, query, options, cb));
  }
}

module.exports = LocalDataSource;


//--------------- helpers ------------//

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