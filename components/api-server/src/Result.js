var setCommonMeta = require('./methods/helpers/setCommonMeta'),
  MultiStream = require('multistream');


var Transform = require('stream').Transform,
  inherits = require('util').inherits;

module.exports = Result;

/**
 * Result object used to store API response while it is processed.
 * In case of batch call, it works as a simple JS object.
 * Otherwise, stores multiple streams in this.combinedStreams for serial sending to client.
 * ie.: each Stream of data will be sent one after the other
 * as they are stringified by ArrayStreams.
 *
 * @constructor
 */
function Result() {
  this._private = { init: false, first: true};
  this.meta = setCommonMeta({}).meta;
}

/**
 * Formats the prefix in the right way depending on whether it is the first data
 * pushed on the result stream or not.
 *
 * @param prefix
 * @returns {string}
 */
Result.prototype.formatPrefix = function (prefix) {
  if (this._private.first) {
    this._private.first = false;
    return '"' + prefix + '":';
  }
  return ',"' + prefix + '":';
};

/**
 * Pushes stream on the result stack, FIFO.
 *
 * @param stream
 */
Result.prototype.addStream = function (stream) {
  if (! this._private.streamsArray) {
    this._private.streamsArray = [];
  }
  this._private.streamsArray.push(stream);
};

/**
 * Called when the output stream chain has been setup to start sending the response, or
 * in case of batch call, simply sends the Result object.
 *
 * @param res {Object} Http.Response
 * @param successCode {Number}
 */
Result.prototype.commit = function (res, successCode) {
  if (this._private.streamsArray) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.statusCode = successCode;

    if (this._private.streamsArray.length === 1) {
      this._private.streamsArray[0].pipe(new ResultStream(this)).pipe(res);
    } else {
      new MultiStream(this._private.streamsArray).pipe(new ResultStream(this)).pipe(res);
    }

  } else {
    delete this._private;
    res.json(this, successCode);
  }
};


/**
 * Stream that wraps the whole result in JSON curly braces before being sent to Http.response
 *
 * @param result {Object} Result object
 * @constructor
 */
function ResultStream(result) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.result = result;
}

inherits(ResultStream, Transform);

ResultStream.prototype._transform = function (data, encoding, callback) {
  if (this.isStart) {
    this.push('{');
    this.isStart = false;
  }
  this.push(data);
  callback();
};

ResultStream.prototype._flush = function (callback) {

  Object.keys(this.result).forEach(function (key) {
    if (key !== '_private') {
      this.push(this.result.formatPrefix(key));
      this.push(JSON.stringify(this.result[key]));
    }
  }.bind(this));
  this.push('}');

  callback();
};

