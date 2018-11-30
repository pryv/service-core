// @flow

var addCommonMeta = require('./methods/helpers/setCommonMeta'),
    MultiStream = require('multistream'),
    DrainStream = require('./methods/streams/DrainStream'),
    ArrayStream = require('./methods/streams/ArrayStream'),
    async = require('async');


const Transform = require('stream').Transform;

type ResultOptions = {
  arrayLimit?: number, 
}
type StreamDescriptor = {
  name: string, 
  stream: stream$Readable,
}
type APIResult = 
  {[string]: Object} |
  {[string]: Array<Object>};
  
type ToObjectCallback = (resOrError: APIResult) => mixed;


// Result object used to store API call response body while it is processed.
// In case of events.get call, it stores multiple streams in this.streamsArray.
// ie.: each Stream of data will be sent one after the other
// Otherwise, it works as a simple JS object.
// 
// The result can be sent back to the caller using writeToHttpResponse or
// recovered as a JS object through the toObject() function.
// 
class Result {
  _private: {
    init: boolean, first: boolean, 
    arrayLimit: number, 
    isStreamResult: boolean, streamsArray: Array<StreamDescriptor>, 
  }
  meta: ?Object;
  
  // These are used by the various methods to store the result objects. 
  // Never assume these are filled in...
  // Exercise to the reader: How can we get rid of this mixed bag of things?
  accesses: ?Array<any>;
  access: mixed;
  accessDeletion: mixed;
  accessDeletions: mixed;
  matchingAccess: mixed;
  mismatchingAccess: mixed;
  checkedPermissions: mixed;
  error: mixed;
  
  constructor(params?: ResultOptions) {
    this._private = { 
      init: false, first: true, 
      arrayLimit: 10000, 
      isStreamResult: false, 
      streamsArray: [],  
    };
    
    this.meta = null;
    
    if (params && params.arrayLimit != null && params.arrayLimit > 0) {
      this._private.arrayLimit = params.arrayLimit;
    }
  }
  
  // Pushes stream on the streamsArray stack, FIFO.
  // 
  addStream(arrayName: string, stream: stream$Readable) {
    this._private.isStreamResult = true; 
    this._private.streamsArray.push({name: arrayName, stream: stream});
  }
  
  // Returns true if the Result holds any streams, false otherwise.
  // 
  isStreamResult() {
    return this._private.isStreamResult;
  }
  
  // Sends the content of Result to the HttpResponse stream passed in parameters.
  // 
  writeToHttpResponse(res: express$Response, successCode: number) {
    if (this.isStreamResult()) {
      this.writeStreams(res, successCode);
    } else {
      this.writeSingle(res, successCode);
    }
  }
  
  writeStreams(res: express$Response, successCode: number) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.statusCode = successCode;

    var streamsArray = this._private.streamsArray;

    if (! this._private.isStreamResult)
      throw new Error('AF: not a stream result.');
    if (streamsArray.length < 1) 
      throw new Error('streams array empty');

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
  }
  
  writeSingle(res: express$Response, successCode: number) {
    delete this._private;
    res
      .status(successCode)
      .json(addCommonMeta(this));
  }
  
  // Returns the content of the Result object in a JS object.
  // In case the Result contains a streamsArray, it will drain them in arrays.
  // 
  toObject(callback: ToObjectCallback) {
    if (this.isStreamResult()) {
      this.toObjectStream(callback);
    } else {
      this.toObjectSingle(callback);
    }
  }
  
  toObjectStream(callback: ToObjectCallback) {
    var _private = this._private;
    var streamsArray = _private.streamsArray;

    var resultObj = {};
    async.forEachOfSeries(streamsArray, (elementDef, i, done) => {
      var drain = new DrainStream({limit: _private.arrayLimit}, (err, list) => {
        if (err) {
          return done(err);
        }
        resultObj[elementDef.name] = list;
        done();
      });
      elementDef.stream.pipe(drain);
    }, (err) => {
      if (err) {
        return callback(err);
      }
      callback(resultObj);
    });
  }
  
  toObjectSingle(callback: ToObjectCallback) {
    delete this._private;
    callback(this);
  }
}

// Stream that wraps the whole result in JSON curly braces before being sent to
// Http.response
class ResultStream extends Transform {
  isStart: boolean;
  
  constructor() {
    super({objectMode: true});
    
    this.isStart = true;
  }
  
  _transform(data, encoding, callback) {
    if (this.isStart) {
      this.push('{');
      this.isStart = false;
    }
    this.push(data);
    callback();
  }
  
  _flush(callback) {
    const thing = ', "meta": ' + JSON.stringify(addCommonMeta({}).meta);
    this.push(thing + '}');

    callback();
  }
}

module.exports = Result;
