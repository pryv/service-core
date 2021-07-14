/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

class StreamsQuery {
  any: ?Array<string>;
  all: ?Array<string>;
  not: ?Array<string>;

  constructor (params: ?{}) {
    if (params == null) return;
    for (const [key, value] of Object.entries(params)) {
      this[key] = value;
    }
  }

  static properties: [
    'any',
    'all',
    'not',
  ]
}

module.exports = StreamsQuery;