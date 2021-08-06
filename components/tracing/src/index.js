/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// used to apply filters compliant with open tracing standards
const { Tags } = require('opentracing');

const { Tracing, DummyTracing } = require('./Tracing');
const { getHookerTracer } = require('./HookedTracer');


const dataBaseTracer = require('./databaseTracer');


module.exports.DummyTracing = DummyTracing;

module.exports.dataBaseTracer = dataBaseTracer;

module.exports.getHookerTracer = getHookerTracer;

/**
 * Starts a root span. For socket.io usage.
 */
function initRootSpan (name: string, tags: ?{} = {}): Tracing {
  const tracing = new Tracing();
  tracing.startSpan(name, { tags });
  setTimeout(() => { 
    tracing.checkIfFinished();
  }, 3000);
  return tracing;
};
module.exports.initRootSpan = initRootSpan;


/**
 * Returns an ExpressJS middleware that starts a span and attaches the "tracing" object to the request parameter.
 */
module.exports.tracingMiddleware = (name: string = 'express', tags: ?{}): Function => {
  return function (req: express$Request, res: express$Response, next: express$NextFunction): void {
    if (req.tracing != null) { console.log('XXXXX tracing already set', new Error()); return next();}
    req.tracing = initRootSpan (name, tags);
    next();
  }
}

/**
 * Tags a span with error data
 */
module.exports.setErrorToTracingSpan = (spanName: string, err: Error, tracing: Tracing): void => {
  tracing.tagSpan(spanName, Tags.ERROR, true);
  tracing.tagSpan(spanName, 'errorId', err.id);
  tracing.tagSpan(spanName, Tags.HTTP_STATUS_CODE, err.httpStatus || 500);
}

/**
 * Starts a span with the "context.methodId" name on "context.tracing".
 * Used in api-server/src/API.js#register
 */
module.exports.startApiCall = (context, params, result, next): void => {
  context.tracing.startSpan(context.methodId, params);
  if (context.username != null) context.tracing.tagSpan(context.methodId, 'username', context.username);
  next();
}
/**
 * Finishes a span with the "context.methodId" name on "context.tracing".
 * Used in api-server/src/API.js#register
 */
module.exports.finishApiCall = (context, params, result, next): void => {
  context.tracing.finishSpan(context.methodId);
  next();
}
