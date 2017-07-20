'use strict';

var addCommonMeta = require('./methods/helpers/setCommonMeta'),
    MultiStream = require('multistream'),
    DrainStream = require('./methods/streams/DrainStream'),
    ArrayStream = require('./methods/streams/ArrayStream'),
    async = require('async');


var Transform = require('stream').Transform,
    inherits = require('util').inherits;

module.exports = Result;

/**
 * Result object used to store API call response body while it is processed.
 * In case of events.get call, it stores multiple streams in this.streamsArray.
 * ie.: each Stream of data will be sent one after the other
 * Otherwise, it works as a simple JS object.
 *
 * The result can be sent back to the caller using writeToHttpResponse or
 * recovered as a JS object through the toObject() function.
 *
 * @param params {Object}
 *        params.arrayLimit {Number} limit of objects to return with toObject()
 * @constructor
 */
function Result(params) {
  this._private = { init: false, first: true};

  if (params && params.arrayLimit > 0) {
    this._private.arrayLimit = params.arrayLimit;
  }
}


/**
 * Pushes stream on the streamsArray stack, FIFO.
 *
 * @param stream {Object}
 *        stream.name {String} data name
 *        stream.stream {Stream} stream containing the data
 */
Result.prototype.addStream = function (arrayName, stream) {
  if (! this._private.streamsArray) {
    this._private.streamsArray = [];
  }
  this._private.streamsArray.push({name: arrayName, stream: stream});
};


/**
 * Returns true if the Result holds any streams, false otherwise.
 *
 * @returns {Array}
 */
Result.prototype.isStreamResult = function() {
  return this._private.streamsArray;
};


/**
 * Sends the content of Result to the HttpResponse stream passed in parameters.
 *
 * @param res {Object} Http.Response
 * @param successCode {Number}
 */
Result.prototype.writeToHttpResponse = function (res, successCode) {
  if (this.isStreamResult()) {
   this.writeStreams(res, successCode);
  } else {
    this.writeSingle(res, successCode);
  }
};

Result.prototype.writeStreams = function(res, successCode) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.statusCode = successCode;

  var streamsArray = this._private.streamsArray;

  if (streamsArray.length < 1) { throw 'error: streams array empty'; }

  // Are we handling a single stream?
  if (streamsArray.length === 1) {
    var first = streamsArray[0];
    return first.stream
      .pipe(new ArrayStream(first.name, true))
      .pipe(new ResultStream())
      .pipe(res);
  }

  // assert: streamsArray.length > 1
  var streams = [];
  for (var i=0; i<streamsArray.length; i++) {
    var s = streamsArray[i];
    streams.push(s.stream.pipe(new ArrayStream(s.name, i === 0)));
  }

  new MultiStream(streams).pipe(new ResultStream()).pipe(res);
};

Result.prototype.writeSingle = function(res, successCode) {
  delete this._private;
  res.json(addCommonMeta(this), successCode);
};


/**
 * Returns the content of the Result object in a JS object.
 * In case the Result contains a streamsArray, it will drain them in arrays.
 *
 * @param callback {Function}
 */
Result.prototype.toObject = function (callback) {
  if (this.isStreamResult()) {
    this.toObjectStream(callback);
  } else {
    this.toObjectSingle(callback);
  }
};

Result.prototype.toObjectStream = function (callback) {
  var _private = this._private;
  var streamsArray = _private.streamsArray;

  var resultObj = {};
  async.forEachOfSeries(streamsArray, function(elementDef, i, done) {
    var drain = new DrainStream({limit: _private.arrayLimit}, function(err, list) {
      if (err) {
        return done(err);
      }
      resultObj[elementDef.name] = list;
      done();
    });
    elementDef.stream.pipe(drain);
  }, function(err) {
    if (err) {
      return callback(err);
    }
    callback(resultObj);
  });
};

Result.prototype.toObjectSingle = function (callback) {
  delete this._private;
  callback(this);
};


/**
 * Stream that wraps the whole result in JSON curly braces before being sent to Http.response
 *
 * @constructor
 */
function ResultStream() {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
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
  var thing = ', "meta": ' + JSON.stringify(addCommonMeta({}).meta);
  this.push(thing + '}');

  callback();
};

