/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

class Attachment {
  id: string;
  fileName: string;
  type: string;
  size: number;
  readToken: string;
  integrity: string;

  constructor(params: {}) {
    for (const [key, value] of Object.entries(params)) {
      this[key] = value;
    }
  }
}
module.exports = Attachment;