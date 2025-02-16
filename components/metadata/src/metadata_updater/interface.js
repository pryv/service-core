/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
