/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * @typedef {{
 *   any: Array<string>;
 *   all?: Array<string>;
 *   not?: Array<string>;
 * }} StreamQuery
 */

/**
 * @typedef {StreamQuery & {
 *   storeId: string;
 * }} StreamQueryWithStoreId
 */

/**
 * @typedef {{
 *   id: string;
 *   fileName: string;
 *   type: string;
 *   size: number;
 *   readToken: string;
 *   integrity: string;
 * }} Attachment
 */

/**
 * @typedef {{
 *   id: string;
 *   streamIds: Array<string>;
 *   streamId: string | undefined | null; // deprecated
 *   type: string;
 *   time: number;
 *   duration: number | undefined | null;
 *   content: any;
 *   tags: Array<string> | undefined | null; // deprecated
 *   description: string | undefined | null;
 *   attachments: Array<Attachment>;
 *   clientData: {};
 *   trashed: boolean | undefined | null;
 *   created: number;
 *   createdBy: string;
 *   modified: number;
 *   modifiedBy: string;
 * }} Event
 */
