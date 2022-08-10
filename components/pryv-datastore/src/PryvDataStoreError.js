/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = PryvDataStoreError;

/**
 * Constructor for data store errors.
 * @param {string} id
 * @param {string} message
 * @param {*} [data]
 * @param {Error} [innerError]
 */
function PryvDataStoreError (id, message, data = null, innerError = null) {
  Error.call(this, message);
  this.id = id;
  this.data = data;
  this.innerError = innerError;
}

PryvDataStoreError.prototype = Object.create(Error.prototype);
