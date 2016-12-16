var MetaStream = require('./methods/streams/MetaStream'),
  setCommonMeta = require('./methods/helpers/setCommonMeta'),
  MultiStream = require('multistream');


var Transform = require('stream').Transform,
  inherits = require('util').inherits;

var Result = module.exports = function () {
  this._private = { init: false, first: true};
  this.meta = setCommonMeta({}).meta;
};



Result.prototype.getPrefix = function (key) {
  if (this._private.first) {
    this._private.first = false;
    return '"' + key + '":';
  }
  return ',"' + key + '":';
};



Result.prototype.addEntryStream = function (stream) {
  if (! this._private.combinedStreams) {
    this._private.combinedStreams = [];
  }
  this._private.combinedStreams.push(stream);
};

Result.prototype.commit = function (res, successCode) {
  if (this._private.combinedStreams) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    if (this._private.combinedStreams.length === 1) {
      this._private.combinedStreams[0].pipe(new ResultStream(this)).pipe(res);
    } else {
      new MultiStream(this._private.combinedStreams).pipe(new ResultStream(this)).pipe(res);
    }

  } else {
    delete this._private;
    res.json(setCommonMeta(this), successCode);
  }
};



/// -----  Stream that wraps the all result
function ResultStream(result) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.result = result;
}

inherits(ResultStream, Transform);


ResultStream.prototype.pipeEntryStream = function (readableStream) {
  readableStream.pipe(this);
};

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
      this.push(this.result.getPrefix(key));
      this.push(JSON.stringify(this.result[key]));
    }
  }.bind(this));
  this.push('}');

  callback();
};

