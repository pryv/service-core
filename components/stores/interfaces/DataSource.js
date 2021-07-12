/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


/**
 * Notes:
 * - supports 
 *    - attachments
 *    - series
 * 
 * - series
 */

function toBeImplemented() {
  throw new Error('Should be Implemented');
}

/**
 * @property {UserStreams} streams 
 * @property {UserEvents} events 
 * @property {timestamp} UNKOWN_DATE - Unkown creation / modification date
 * @property {string} BY_SYSTEM - When createdBy / modifiedBy value is SYSTEM
 * @property {string} BY_UNKOWN - When createdBy / modifiedBy value is UNKOWN
 * @property {string} BY_EXTERNAL_PREFIX - When createdBy / modifiedBy value is an external Reference
 */
class DataSource { 
  /**
   * Data source id 
   * ex: "local", "system"
   */
  get id() { toBeImplemented(); } 

  /**
   * Data source name 
   * ex: "localStorage", "System Streams"
   */
  get name() { toBeImplemented(); } 
  
  async init() { toBeImplemented(); }

  /** @returns  UserStreams */
  get streams() { toBeImplemented(); } 
  /** @returns  UserEvents */
  get events() { toBeImplemented(); } 

  // -- will be overriden by the system to throw appropriate error
  static throwUnkownRessource(resourceType, id, innerError) { // APIError.UnknownResource 
    console.error('unkownRessource', resourceType, id, innerError);
    throw(new Error('unkownRessource ' + resourceType + ' id: '+  id));
  } 

  // -- will be overriden by the system to throw appropriate error
  static throwInvalidRequestStructure(message, data) { // APIError.InvalidRequestStructure 
    console.error('invalidRequestStructure', message, data);
    throw(new Error('invalidRequestStructure ' + message + ' ' + data));
  } 


  /**
   * Uncomment and implement the following if this storage supports it
   * @param {identifier} streamId - the streamId to expand (should be returned in Array list)
   * @returns {Streams<Array>|string|null> returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
   */
  //async expandStreamForStreamQuery(streamId) { toBeImplemented(); }

  // ----------- Store Settings ------ //


}

DataSource.UNKOWN_DATE = 10000000.00000001;
DataSource.BY_SYSTEM = 'system';
DataSource.BY_UNKOWN = 'unkown';
DataSource.BY_EXTERNAL_PREFIX = 'external-';


/**
 * Holder for per-user Stream tree structure under this user
 */
class UserStreams {

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Source.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} uid
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by Stores 
   * @param {identifier} [params.expandChildren] default false, if true also return childrens
   * @param {identifiers} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is true, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(uid, params) { toBeImplemented(); }


  /**
   * @see https://api.pryv.com/reference/#create-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws ressource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Stream} - The created Stream
   */
  async create(uid, params)  { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#update-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Stream
   */
  async update(uid, streamid, params) { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#delete-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream|StreamDeletionItem} - The trashed Stream
   */
  async delete(uid, streamid, params) { toBeImplemented(); }

  /**
   * Utility to complete a stream structure with missing properties and streamIds.
   * **Note** streams object will be modified
   * @property {string} storeId - to be happend to streamId with '.${storeId}-'
   * @property {Array<Streams>} streams
   * @returns null;
   */
  static applyDefaults(streams) {
    _applyDefaults(streams, null);
  }
}

/**
 * @private
 * recursively apply default streamId datasource namne and streams default value
 * @param {string} storeIdNameSpace - namespacing for streamIds
 * @param {Array<Streams>} streams 
 */
function _applyDefaults(streams, parentId) {
  for (let stream of streams) {
    if (typeof stream.created === 'undefined') stream.created = DataSource.UNKOWN_DATE;
    if (typeof stream.modified === 'undefined') stream.modified = DataSource.UNKOWN_DATE;
    if (typeof stream.createdBy === 'undefined') stream.createdBy = DataSource.BY_UNKOWN;
    if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = DataSource.BY_UNKOWN;
    if (! stream.children) stream.children = [];
    if (stream.children.length > 0) _applyDefaults(stream.children, stream.id);
    // force parentId
    stream.parentId = parentId;
  }
}


/**
 * Holder for per-user Stream tree structure under this user
 */
class UserEvents {

  /**
   * Get the events for this user.
   * @param {identifier} uid  
   * @param {object} params - event query
   * @returns {Array<Stream>}
   * @see https://api.pryv.com/reference/#get-events
   */
  async get(uid, params) { toBeImplemented(); }


  /**
   * Get the events as a stream for this user.  
   * @param {identifier} uid  
   * @param {object} params - event query
   * @returns {Readable}
   * @see https://api.pryv.com/reference/#get-events
   */
   async getStreamed(uid, params) { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws ressource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
  async create(uid, params)  { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#update-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Event
   */
  async update(uid, eventId, params) { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#delete-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Event|EventDeletionItem} - The trashed Event
   */
  async delete(uid, eventId, params) { toBeImplemented(); }


  /**
   * All attachemnts method
   */

  /**
   * Add series ? do we have specific methods for series ... ? 
   */


   /**
   * Utility to complete a event properties with missing properties and complete streamIds.
   * **Note** events object will be modified
   * @property {string} storeId - to be happend to streamId with '.${storeId}-'
   * @property {Array<Events>} events
   * @returns null;
   */
  static applyDefaults(events) {
    for (let event of events) {
      if (typeof event.created === 'undefined') event.created = DataSource.UNKOWN_DATE;
      if (typeof event.modified === 'undefined') event.modified = DataSource.UNKOWN_DATE;
      if (typeof event.createdBy === 'undefined') event.createdBy = DataSource.BY_UNKOWN;
      if (typeof event.modifiedBy === 'undefined') event.modifiedBy = DataSource.BY_UNKOWN;
    }
  }
}

module.exports = {
  DataSource,
  UserEvents,
  UserStreams
}