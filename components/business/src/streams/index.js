/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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
