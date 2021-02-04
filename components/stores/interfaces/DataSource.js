

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

  /**
   * Get UserSource instance for  this userId or null if unkown;
   * @param {string} uid - userId
   * @returns {UserSource}
   */
  async forUID(uid) { toBeImplemented(); } 
  
  async init() { toBeImplemented(); }

  get streams() { toBeImplemented(); } 
  get events() { toBeImplemented(); } 

  static errorUnkownRessource(message, data) {
    console.error('unkownRessource', message, data);
  } 

}

DataSource.UNKOWN_DATE = 0.12345678;
DataSource.BY_SYSTEM = '.system';
DataSource.BY_UNKOWN = '.unkown';
DataSource.BY_EXTERNAL_PREFIX = '.external-';


/**
 * Holder for per-user Stream tree structure under this user
 */
class UserStreams {

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Source.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} uid
   * @param {Object} params
   * @param {identifier} params.parentId
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @param {timestamp} [params.includeDeletionsSince] 
   * @param {identifier} [streamId] - the streamId to ge or null to get the root of this volume
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
  static applyDefaults(storeId, streams) {
    _applyDefaults(storeId ? '.' + storeId + '-' : null, streams);
  }
}

/**
 * @private
 * recursively apply default streamId datasource namne and streams default value
 * @param {string} storeIdNameSpace - namespacing for streamIds
 * @param {Array<Streams>} streams 
 */
function _applyDefaults(storeIdNameSpace, streams) {
  for (let stream of streams) {
    if (storeIdNameSpace) stream.id = storeIdNameSpace + stream.id;
    if (typeof stream.created === 'undefined') stream.created = DataSource.UNKOWN_DATE;
    if (typeof stream.modified === 'undefined') stream.modified = DataSource.UNKOWN_DATE;
    if (typeof stream.createdBy === 'undefined') stream.createdBy = DataSource.BY_UNKOWN;
    if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = DataSource.BY_UNKOWN;
    if (! stream.children) stream.children = [];
    if (stream.children.length > 0) _applyDefaults(storeIdNameSpace, stream.children);
  }
}


/**
 * Holder for per-user Stream tree structure under this user
 */
class UserEvents {

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Source.
   * @param {identifier} uid  
   * @see https://api.pryv.com/reference/#get-events
   */
  async get(uid, params) { toBeImplemented(); }

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

}

module.exports = {
  DataSource,
  UserEvents,
  UserStreams
}