/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Stream = require('../streams/Stream');

class SystemStream extends Stream {

  isIndexed: boolean;
  isUnique: boolean;
  isShown: boolean;
  isEditable: boolean;
  isRequiredInValidation: boolean;

  constructor (params: {}) {
    super(params);
    params.forEach(p => {
      this[p] = p;
    })
  }

}

module.exports = SystemStream;