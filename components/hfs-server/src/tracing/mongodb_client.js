/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Extracted from https://github.com/RisingStack/opentracing-auto/blob/master/src/instrumentation/mongodbCore.js
// 
// Wraps a few core calls to mongodb to provide span tracing on mongodb operations. 
// Works via the 'cls-hooked' storage, which should be initialized for every
// request. 

const logger = require('boiler').getLogger('mongodb_client_tracing');
const { Tags } = require('opentracing');
const shimmer = require('shimmer');

const cls = require('./cls');

const DB_TYPE = 'mongodb';
const OPERATION_NAME = 'mongodb';

import typeof LibMongoDb from 'mongodb';
import type { Tracer, Span } from 'opentracing';

function nextWrapFactory (tracer: Tracer) { // called by us
  return function nextWrap (original) {     // called by shimmer
    return function nextTrace(cb) {         // called by user code
      const rootSpan = cls.getRootSpan();
      if (rootSpan == null) 
        return original.call(this, cb);
      
      const operationName = `${OPERATION_NAME}_cursor`;
      const statement = JSON.stringify(this.cmd);
      const opts = {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          databaseType: DB_TYPE,
          databaseStatement: statement
        }, 
        childOf: rootSpan,
      };
      
      logger.debug(`Operation started ${OPERATION_NAME}`, opts.tags);

      const span = tracer.startSpan(operationName, opts);
      return original.call(this, wrapCallback(tracer, span, operationName, cb));
    };
  };
}

type NodeCallback = (?Error, ?mixed) => mixed;

// Returns a callback function that will terminate the span given in `span` before
// calling the `done` callback with the same arguments it was called. 
// 'Wraps' the callback given in `done`. 
// 
function wrapCallback (tracer: Tracer, span: Span, operationName: string, done: ?NodeCallback) {
  return function (err, res) {
    if (err != null) {
      span.log({
        event: 'error',
        'error.object': err,
        message: err.message,
        stack: err.stack,
      });
      
      span.setTag(Tags.ERROR, true);

      logger.debug(`Operation error captured ${operationName}`, {
        reason: 'Error event',
        errorMessage: err.message });
    }

    span.finish();

    logger.debug(`Operation finished ${operationName}`);

    if (done != null) {
      return done(err, res);
    }
  };
}

type ShimmerOriginalMethod = 
  (string, Object, Object | NodeCallback, ?NodeCallback) => mixed;
type ShimmerPatchedMethod = ShimmerOriginalMethod;
  
function wrapFactory (tracer: Tracer, command: string) {
  return function (original: ShimmerOriginalMethod): ShimmerPatchedMethod {
    return function mongoOperationTrace (ns, ops, options, callback) {
      const rootSpan: Span = cls.getRootSpan();
      if (rootSpan == null) 
        return original.call(this, ns, ops, options, callback);
      
      const operationName = `${OPERATION_NAME}_${command}`;
      const statement = JSON.stringify(ops);
      const opts = {
        tags: {
          [Tags.SPAN_KIND]: Tags.SPAN_KIND_RPC_CLIENT,
          databaseType: DB_TYPE,
          databaseStatement: statement,
          databaseInstance: ns,
        }, 
        childOf: rootSpan,
      };
      const span: Span = tracer.startSpan(operationName, opts);

      logger.debug(`Operation started ${operationName}`, opts.tags);
            
      // Now call through to the original function, wrapping the callback. 
      
      if (typeof options === 'function') 
        return original.call(this, ns, ops, wrapCallback(tracer, span, operationName, options));

      return original.call(this, ns, ops, options, wrapCallback(tracer, span, operationName, callback));
    };
  };
}

function patch (tracer: Tracer) {
  const mongoCore = require('mongodb-core');
  shimmer.wrap(mongoCore.Server.prototype, 'command', wrapFactory(tracer, 'command'));
  shimmer.wrap(mongoCore.Server.prototype, 'insert', wrapFactory(tracer, 'insert'));
  shimmer.wrap(mongoCore.Server.prototype, 'update', wrapFactory(tracer, 'update'));
  shimmer.wrap(mongoCore.Server.prototype, 'remove', wrapFactory(tracer, 'remove'));

  const mongoPorcelain = require('mongodb');
  shimmer.wrap(mongoPorcelain.Cursor.prototype, 'next', nextWrapFactory(tracer));

  logger.debug('Patched');
}

function unpatch (mongodb: LibMongoDb) {
  shimmer.unwrap(mongodb.Server.prototype, 'command');
  shimmer.unwrap(mongodb.Server.prototype, 'insert');
  shimmer.unwrap(mongodb.Server.prototype, 'update');
  shimmer.unwrap(mongodb.Server.prototype, 'remove');
  shimmer.unwrap(mongodb.Cursor.prototype, 'next');

  logger.debug('Unpatched');
}

module.exports = {
  patch,
  unpatch
};
