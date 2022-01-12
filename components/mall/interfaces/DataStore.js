/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

import type { Stream } from 'business/src/streams';
import type { Event } from 'business/src/events';

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
class DataStore { 

  static UNKOWN_DATE: number = 10000000.00000001;
  static BY_SYSTEM: string = 'system';
  static BY_UNKOWN: string = 'unkown';
  static BY_EXTERNAL_PREFIX: string = 'external-';

  _id: string;
  _name: string;
  _streams: UserStreams;
  _events: UserEvents;

  set id(id: string): void { this._id = id; }
  set name(name: string): void { this._name = name; }
  get id(): string { return this._id; }
  get name(): string { return this._name; }
  
  async init(config: {}): Promise<void> { toBeImplemented(); }

  /** @returns  UserStreams */
  get streams(): UserStreams { toBeImplemented(); } 
  /** @returns  UserEvents */
  get events(): UserEvents { toBeImplemented(); } 

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



/**
 * Holder for per-user Stream tree structure under this user
 */
class UserStreams {

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Store.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} uid
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by stores 
   * @param {identifier} [params.expandChildren] default false, if true also return childrens
   * @param {identifiers} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is true, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(uid: string, params): Promise<Array<Stream>> { toBeImplemented(); }


  /**
   * @see https://api.pryv.com/reference/#create-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws ressource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Stream} - The created Stream
   */
  async create(uid: string, params): Promise<void> { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#update-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Stream
   */
  async update(uid: string, streamId: string, params): Promise<void> { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#delete-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream|StreamDeletionItem} - The trashed Stream
   */
  async delete(uid: string, streamId: string, params): Promise<void> { toBeImplemented(); }

  /**
   * Utility to complete a stream structure with missing properties and streamIds.
   * **Note** streams object will be modified
   * @property {string} storeId - to be happend to streamId with '.${storeId}-'
   * @property {Array<Streams>} streams
   * @returns null;
   */
  static applyDefaults(streams: Array<Stream>): void {
    _applyDefaults(streams, null);
  }
}

/**
 * @private
 * recursively apply default streamId datastore namne and streams default value
 * @param {string} storeIdNameSpace - namespacing for streamIds
 * @param {Array<Streams>} streams 
 */
function _applyDefaults(streams: Array<Stream>, parentId: ?string): void {
  for (const stream: Stream of streams) {
    if (typeof stream.created === 'undefined') stream.created = DataStore.UNKOWN_DATE;
    if (typeof stream.modified === 'undefined') stream.modified = DataStore.UNKOWN_DATE;
    if (typeof stream.createdBy === 'undefined') stream.createdBy = DataStore.BY_UNKOWN;
    if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = DataStore.BY_UNKOWN;
    if (stream.children == null) stream.children = [];
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
   * @param {boolean} [params.includeDeletions] - default false
   * @param {boolean} [params.includeHistory] - default false
   * @returns {Array<Event>}
   * @see https://api.pryv.com/reference/#get-events
   */
  async get(uid: string, params): Promise<Array<Event>> { toBeImplemented(); }


  /**
   * Get the events as a stream for this user.  
   * @param {identifier} uid  
   * @param {object} params - event query
   * @returns {ReadableStream}
   * @see https://api.pryv.com/reference/#get-events
   */
  async getStreamed(uid: string, params): Promise<ReadableStream> { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws ressource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
  async create(uid: string, params): Promise<void>  { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#update-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Event
   */
  async update(uid: string, eventId: string, params): Promise<void> { toBeImplemented(); }

  /**
   * @see https://api.pryv.com/reference/#delete-event
   * @param {identifier} uid 
   * @throws item-already-exists
   * @throws ressource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Event|EventDeletionItem} - The trashed Event
   */
  async delete(uid: string, eventId: string, params): Promise<void> { toBeImplemented(); }


  /**
   * All attachments method
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
  static applyDefaults(events: Array<Event>) {
    for (const event: Event of events) {
      if (typeof event.created === 'undefined') event.created = DataStore.UNKOWN_DATE;
      if (typeof event.modified === 'undefined') event.modified = DataStore.UNKOWN_DATE;
      if (typeof event.createdBy === 'undefined') event.createdBy = DataStore.BY_UNKOWN;
      if (typeof event.modifiedBy === 'undefined') event.modifiedBy = DataStore.BY_UNKOWN;
    }
  }
}

module.exports = {
  DataStore,
  UserEvents,
  UserStreams
}