/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

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
  async get(uid: string, params): Promise<Array<Stream>> { throw new Error('Not implemented'); }


  /**
   * @see https://api.pryv.com/reference/#create-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Stream} - The created Stream
   */
  async create(uid: string, params): Promise<void> { throw new Error('Not implemented'); }

  /**
   * @see https://api.pryv.com/reference/#update-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream} - The update Stream
   */
  async update(uid: string, streamId: string, params): Promise<void> { throw new Error('Not implemented'); }

  /**
   * @see https://api.pryv.com/reference/#delete-stream
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Stream|StreamDeletionItem} - The trashed Stream
   */
  async delete(uid: string, streamId: string, params): Promise<void> { throw new Error('Not implemented'); }

}



module.exports = UserStreams;
