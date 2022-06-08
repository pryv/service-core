/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Per-user streams data (tree structure)
 */
class UserStreams {

  /**
   * Get the stream that will be set as root for all Stream Structure of this Data Store.
   * @see https://api.pryv.com/reference/#get-streams
   * @param {identifier} userId
   * @param {Object} params
   * @param {identifier} [params.id] null, means root streamId. Notice parentId is not implemented by stores
   * @param {identifier} [params.expandChildren]
   * @param {identifiers} [params.excludeIds] list of streamIds to exclude from query. if expandChildren is >0 or < 0, children of excludedIds should be excludded too
   * @param {boolean} [params.includeTrashed] (equivalent to state = 'all')
   * @returns {UserStream|null} - the stream or null if not found:
   */
  async get(userId: string, params): Promise<Array<Stream>> { throw new Error('Not implemented'); }

  /**
   * Get a list of deleted Ids since
   * @param {identifier} userId
   * @param {timestamp} deletionSince
   */
  async getDeletions(userId: string, deletionsSince: timestamp) { throw new Error('Not implemented');  }

  /**
   * @see https://api.pryv.com/reference/#create-stream
   * @param {identifier} userId
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Stream} - The created Stream
   */
  async create(userId: string, params): Promise<void> { throw new Error('Not implemented'); }

  /**
   * @see https://api.pryv.com/reference/#update-stream
   * @param {identifier} userId
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Stream
   */
  async update(userId: string, streamId: string, params): Promise<void> { throw new Error('Not implemented'); }

  /**
   * @see https://api.pryv.com/reference/#delete-stream
   * @param {identifier} userId
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream|StreamDeletionItem} - The trashed Stream
   */
  async delete(userId: string, streamId: string, params): Promise<void> { throw new Error('Not implemented'); }

}

module.exports = UserStreams;
