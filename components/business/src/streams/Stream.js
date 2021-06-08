/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

class Stream {

  id: string;
  name: string;
  parentId: ?string;
  clientData: ?Map<string, any>;
  children: ?Array<Stream>;
  trashed: ?boolean;
  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  static properties: Array<string>;

  constructor (params: {}) {
    for (const [key, value] of Object.entries(params)) {
      this[key] = value;
    }
  }
}

Stream.properties = [
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

module.exports = Stream;