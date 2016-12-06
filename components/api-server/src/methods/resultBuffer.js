var setCommonMeta = require('./helpers/setCommonMeta');

/**
 * Smart object meant to send HTTP responses in a buffered fashion
 *
 * @param params {Object}
 *        params.res {Object}
 *          Response object from ExpressJS, must send data to source by calling .json()
 *          function
 *        params.next {Function}
 *          Express middleware callback
 *        params.successCode {Number}
 *          HTTP status code sent in case of successful execution, default is 200
 *        params.bufferSize {Number}
 *          buffer size in kB, default is 512kB
 *        params.buffer {Object}
 *          (optional) may initialize ResultBuffer with a buffer, default is {}
 *
 * @constructor
 */
var ResultBuffer = function (params) {

  if (typeof params.res.json !== 'function') {
    throw new Error('must provide an object with the adequate function');
  }
  this.res = params.res;

  this.next = params.next;

  this.successCode = params.successCode || 200;

  // in kBytes, default: 512 kB
  this.bufferSize = params.bufferSize || 512 * 1024;

  this.buffer = params.buffer || '';

  this.firstBatch = true;
};

ResultBuffer.prototype.next = function (err, res) {
  return this.next(err, res);
};

/**
 * pushes key value pairs to HTTP response
 */
ResultBuffer.prototype.push = function (data) {

  console.log('rBuffer pushed');
  // case first message: set headers
  if (this.firstBatch) {
    this.res.writeHead(this.successCode,
      {'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked'});
  }
  this.firstBatch = false;

  this.buffer += data;

  if ((Buffer.byteLength(this.buffer) > this.bufferSize)) {
    // TODO: don't use successCode here, since it's a partial response?
    console.log('rBuffer writing', this.buffer);
    this.res.write(this.buffer);
    this.buffer = {};
  }
};

/**
 * Writes on the socket with the provided HTTP status
 *
 * @param data
 */
ResultBuffer.prototype.end = function () {
  // TODO: check if buffer is empty
  if (this.buffer !== '') {
    console.log('writing on pre-end', this.buffer);
    this.res.write(this.buffer);
  }
  var metaHolder =  setCommonMeta({});
  var ending = ', "meta": ' + JSON.stringify(metaHolder.meta) + ' }';
  console.log('writing ending:', ending);
  this.res.write(ending);
  console.log('rBuffer is closing conn');
  this.res.end();
  console.log('rBuffer closed');
};


module.exports = ResultBuffer;