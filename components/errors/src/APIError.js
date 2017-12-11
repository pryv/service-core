var util = require('util');

/**
 * The constructor to use for all errors within the API.
 *
 * @constructor
 * @param {String} id
 * @param {String} message
 * @param {Object} options Possible options: {Number} httpStatus, {*} data, {Error} innerError, {Boolean} dontNotifyAirbrake
 */
var APIError = module.exports = function (id, message, options) {
  APIError.super_.call(this);

  this.id = id;
  this.message = message;
  if (options.httpStatus) { this.httpStatus = options.httpStatus; }
  if (options.data) { this.data = options.data; }
  if (options.innerError) { this.innerError = options.innerError; }
  if (options.dontNotifyAirbrake) { this.dontNotifyAirbrake = options.dontNotifyAirbrake; }
};

util.inherits(APIError, Error);
APIError.prototype.name = 'APIError';
