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
