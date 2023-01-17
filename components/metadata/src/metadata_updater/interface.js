
/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/** @typedef {Object} IUpdateRequest
 * @property {string} userId
 * @property {string} eventId
 * @property {string} author
 * @property {number} timestamp
 * @property {ITimeRange} dataExtent
 */

/** @typedef {Object} ITimeRange
 * @property {number} from
 * @property {number} to
 */

/** @typedef {Object} IUpdateResponse */

/** @typedef {Object} IUpdateId
 * @property {string} userId
 * @property {string} eventId
 */

/** @typedef {Object} IPendingUpdate
 * @property {boolean} found
 * @property {number} deadline
 */

/** @typedef {Object} IMetadataUpdaterService */
