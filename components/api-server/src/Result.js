/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const commonMeta = require('./methods/helpers/setCommonMeta');
const MultiStream = require('multistream');
const DrainStream = require('./methods/streams/DrainStream');
const ArrayStream = require('./methods/streams/ArrayStream');
const async = require('async');

const { Transform, Readable} = require('stream');

const { DummyTracing } = require('tracing');

import type { Webhook } from 'business/webhooks';

type ResultOptions = {
  arrayLimit?: number,
  tracing?: object
}
type StreamDescriptor = {
  name: string,
  stream: stream$Readable,
}
type APIResult =
  {[string]: Object} |
  {[string]: Array<Object>};

type ToObjectCallback = (err: ?Error, res: ?APIResult) => mixed;

type doneCallBack = () => mixed;

type itemDeletion = {
  id: string,
  deleted: number,
};

type PermissionLevel = 'read' | 'contribute' | 'manage';
type Setting = 'forbidden';

type Permission = {
  streamId: string,
  level: PermissionLevel,
} | {
  feature: string,
  setting: Setting,
};

(async () => {
  await commonMeta.loadSettings();
})();



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
    isStreamResult: boolean,
    streamsArray: Array<StreamDescriptor>,
    onEndCallback: ?doneCallBack,
    streamsConcatArrays: Object,
    tracing: Object,
  };
  meta: ?Object;

  // These are used by the various methods to store the result objects.
  // Never assume these are filled in...
  // Exercise to the reader: How can we get rid of this mixed bag of things?
  accesses: ?Array<any>;
  access: mixed;
  accessDeletion: mixed;
  accessDeletions: mixed;
  relatedDeletions: ?Array<any>;
  matchingAccess: mixed;
  mismatchingAccess: mixed;
  checkedPermissions: mixed;
  error: mixed;

  event: ?Event;
  events: ?Array<Event>;

  type: string;
  name: string;
  permissions: Array<Permission>

  results: Array<Result>;

  webhook: Webhook;
  webhooks: Array<Webhook>;

  webhookDeletion: itemDeletion;

  auditLogs: ?Array<{}>;


  constructor(params?: ResultOptions) {
    this._private = {
      init: false, first: true,
      arrayLimit: 10000,
      isStreamResult: false,
      streamsArray: [],
      onEndCallback: null,
      streamsConcatArrays: {},
      tracing: params?.tracing || new DummyTracing(),
      tracingId: null
    };
    this._private.tracingId = this._private.tracing.startSpan('apiResult');

    if (params && params.arrayLimit != null && params.arrayLimit > 0) {
      this._private.arrayLimit = params.arrayLimit;
    }
  }

  closeTracing() {
    this._private.tracing.finishSpan(this._private.tracingId);
  }

  // Array concat stream
  addToConcatArrayStream(arrayName: string, stream: stream$Readable) {
    if (! this._private.streamsConcatArrays[arrayName]) {
      this._private.streamsConcatArrays[arrayName] = new StreamConcatArray(this._private.tracing, this._private.tracingId);
    }
    this._private.streamsConcatArrays[arrayName].add(stream);
    this._private.tracing.startSpan('addToConcatArrayStream:' + arrayName);
  }

  // Close
  closeConcatArrayStream(arrayName: string) {
    if (! this._private.streamsConcatArrays[arrayName]) {
      return;
    }
    this._private.tracing.finishSpan('addToConcatArrayStream:' + arrayName);
    this.addStream(arrayName, this._private.streamsConcatArrays[arrayName].getStream());
    this._private.streamsConcatArrays[arrayName].close();
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

  // Execute the following when result has been fully sent
  // If already sent callback is called right away
  onEnd(callback: doneCallBack) {
    this._private.onEndCallback = callback;
  }

  // Sends the content of Result to the HttpResponse stream passed in parameters.
  //
  writeToHttpResponse(res: express$Response, successCode: number) {

    const onEndCallBack = this._private.onEndCallback;
    if (this.isStreamResult()) {
      const writeTracingId = this._private.tracing.startSpan('writeToHttpResponse', {}, this._private.tracingId);
      const stream: Readable = this.writeStreams(res, successCode);
      stream.on('close', function() {
        if (onEndCallBack) onEndCallBack();
        this._private.tracing.finishSpan(writeTracingId);
        this.closeTracing();
      }.bind(this));
    } else {
      this.closeTracing();
      this.writeSingle(res, successCode);
      if (onEndCallBack) onEndCallBack();
    }
  }

  writeStreams(res: express$Response, successCode: number): Readable {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.statusCode = successCode;

    const streamsArray = this._private.streamsArray;

    if (! this._private.isStreamResult)
      throw new Error('AF: not a stream result.');
    if (streamsArray.length < 1)
      throw new Error('streams array empty');

    // Are we handling a single stream?
    if (streamsArray.length === 1) {
      const first = streamsArray[0];
      return first.stream
        .pipe(new ArrayStream(first.name, true))
        .pipe(new ResultStream(this._private.tracing, this._private.tracingId))
        .pipe(res);
    }

    // assert: streamsArray.length > 1
    const streams = [];
    for (let i=0; i<streamsArray.length; i++) {
      const s = streamsArray[i];
      streams.push(s.stream.pipe(new ArrayStream(s.name, i === 0)));
    }

    return new MultiStream(streams).pipe(new ResultStream(this._private.tracing, this._private.tracingId)).pipe(res);
  }

  writeSingle(res: express$Response, successCode: number) {
    delete this._private;
    res
      .status(successCode)
      .json(commonMeta.setCommonMeta(this));
  }

  // Returns the content of the Result object in a JS object.
  // In case the Result contains a streamsArray, it will drain them in arrays.
  //
  toObject(callback: ToObjectCallback) {
    this.closeTracing();
    if (this.isStreamResult()) {
      this.toObjectStream(callback);
    } else {
      this.toObjectSingle(callback);
    }
  }

  toObjectStream(callback: ToObjectCallback) {
    const _private = this._private;
    const streamsArray = _private.streamsArray;

    const resultObj = {};
    async.forEachOfSeries(streamsArray, (elementDef, i, done) => {
      const drain = new DrainStream({limit: _private.arrayLimit}, (err, list) => {
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
      callback(null, resultObj);
    });
  }

  toObjectSingle(callback: ToObjectCallback) {
    delete this._private;
    callback(null, this);
  }
}

// Stream that wraps the whole result in JSON curly braces before being sent to
// Http.response
class ResultStream extends Transform {
  isStart: boolean;
  tracing: object;
  tracingId: string;

  constructor(tracing, parentTracingId) {
    super({objectMode: true});

    this.isStart = true;
    this.tracing = tracing;
    this.tracingId = this.tracing.startSpan('resultStream', {}, parentTracingId);
  }

  _transform(data, encoding, callback) {
    if (this.isStart) {
      this.push('{');
      this.isStart = false;
      this.tracing.logForSpan(this.tracingId, {event: 'start'});
    }
    this.push(data);
    this.tracing.logForSpan(this.tracingId, {event: 'push'});
    callback();
  }

  _flush(callback) {
    const thing = ', "meta": ' + JSON.stringify(commonMeta.setCommonMeta({}).meta);
    this.push(thing + '}');
    this.tracing.finishSpan('resultStream');
    callback();
  }
}

module.exports = Result;


class StreamConcatArray {
  streamsToAdd: Array<stream$Readable>;
  nextFactoryCallBack: Function;
  multistream: MultiStream;
  isClosed: boolean;
  tracing: ?Object;
  tracingName: string;

  constructor(tracing, parentTracingId) {
    // holds pending stream not yet taken by
    this.streamsToAdd = [];
    this.nextFactoryCallBack = null;
    this.isClosed = false;
    this.tracing = tracing;
    this.tracingName = this.tracing.startSpan('streamConcat', {}, parentTracingId);
    const streamConcact = this;
    function factory(callback) {
      streamConcact.nextFactoryCallBack = callback;
      streamConcact._next();
    }
    this.multistream = new MultiStream(factory, {objectMode: true});
  }

  /**
   * @private
   */
  _next() {
    if (! this.nextFactoryCallBack) return;
    if (this.streamsToAdd.length > 0) {
      const nextStream = this.streamsToAdd.shift();
      this.tracing.logForSpan(this.tracingName, {event: 'shiftStream'});
      this.nextFactoryCallBack(null, nextStream);
      this.nextFactoryCallBack = null;
      return;
    }
    if (this.isClosed) {
      this.tracing.finishSpan(this.tracingName);
      this.nextFactoryCallBack(null, null);
      this.nextFactoryCallBack = null;
    }
  }

  getStream() {
    return this.multistream;
  }

  add(readableStream: Readable) {
    this.tracing.logForSpan(this.tracingName, {event: 'addStream'});
    this.streamsToAdd.push(readableStream);
  }

  close() {
    this.isClosed = true;
    this._next();
  }
}
