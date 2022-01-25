/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Constants = require('./Constants');

function toBeImplemented() {
  throw new Error('Should be Implemented');
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
    if (typeof stream.created === 'undefined') stream.created = Constants.UNKNOWN_DATE;
    if (typeof stream.modified === 'undefined') stream.modified = Constants.UNKNOWN_DATE;
    if (typeof stream.createdBy === 'undefined') stream.createdBy = Constants.BY_UNKOWN;
    if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = Constants.BY_UNKOWN;
    if (stream.children == null) stream.children = [];
    if (stream.children.length > 0) _applyDefaults(stream.children, stream.id);
    // force parentId
    stream.parentId = parentId;
  }
}

module.exports = UserStreams;