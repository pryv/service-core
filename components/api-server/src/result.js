var MetaStream = require('./methods/streams/MetaStream'),
  setCommonMeta = require('./methods/helpers/setCommonMeta');


var Transform = require('stream').Transform,
  inherits = require('util').inherits;

var Result = module.exports = function () {
  this._private = { init: false, first: ''};
};



Result.prototype.write = function (string) {
  console.log('A XXXXXXX', string);
  if (! this._private.res) {
    throw new Error('Connot user Result.resultStream withous res');
  }
  if (! this._private.init) {
    this._private.init = true;

  }
  this._private.res.write(string);
};


Result.prototype.pipeEntryStream = function (key, stream) {
  if (! this._private.streamResult) {
    this._private.streamResult = new ResultStream(this);
    console.log('XXXXX B', key);
  }
  this._private.streamResult.pipeEntryStream(key, stream);
};

Result.prototype.commit = function (res, successCode) {
  //res.setHeader('Content-Type', 'application/json');
  if (this._private.streamResult) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    this._private.streamResult
      .pipe(res);
  } else {
    delete this._private;

    var toto = {};
    Object.keys(this).forEach(function (key) {
      if (this.hasOwnProperty(key) && key !== '_private') {

        toto[key] = this[key];
      }
    });


    res.json(setCommonMeta(toto), successCode);
  }

  /**
  console.log('C XXXXXXX');
  this._private.res = res;
  this.keys().forEach(function (key) { 
    if (this.hasOwnProperty(key) && key !== '_private') {

      this.newEntry(key, this[key]);
    }
  });

  this._private.res.write('}');
  this._private.res.end();

  **/

};



/// -----
function ResultStream(result) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.result = result;
}

inherits(ResultStream, Transform);


ResultStream.prototype.pipeEntryStream = function(key, readableStream) {
  this.NewPipe = key;
  readableStream.pipe(this);
};

ResultStream.prototype._transform = function (data, encoding, callback) {
  if (this.NewPipe) {
    this.push(this.isStart ? '{' : ',');
    this.push('"' + this.NewPipe + '": ');
    this.NewPipe = false;
  }
  this.isStart = false;
  this.push(data);
  callback();
};

ResultStream.prototype._flush = function (callback) {
  if (! this.start) {
    this.push(',');
  }
  this.push('"meta": ' + JSON.stringify(setCommonMeta({}).meta) + '}');
  callback();
};