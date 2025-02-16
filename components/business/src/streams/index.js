/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const StreamProperties = [
  'id',
  'name',
  'parentId',
  'clientData',
  'children',
  'trashed',
  'created',
  'createdBy',
  'modified',
  'modifiedBy'
];
Object.freeze(StreamProperties);
module.exports = {
  StreamProperties
};

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   parentId: string | undefined | null;
 *   clientData: Map<string, any> | undefined | null;
 *   children: Array<Stream> | undefined | null;
 *   trashed: boolean | undefined | null;
 *   created: number;
 *   createdBy: string;
 *   modified: number;
 *   modifiedBy: string;
 *   // stores
 *   childrenHidden: boolean | undefined | null;
 * }} Stream
 */
