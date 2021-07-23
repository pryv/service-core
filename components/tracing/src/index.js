/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const { initTracer: initJaegerTracer } = require('jaeger-client');

// used to apply filters compliant with open tracing standards
const { Tags } = require('opentracing');

const TRACING_NAME: string = 'api-server';

/**
 * The jaeger tracer singleton
 */
let tracerSingleton;
function getTracer(): {} {
  if (tracerSingleton != null) return tracerSingleton;
  tracerSingleton = initTracer(TRACING_NAME);
  return tracerSingleton;
}

/**
 * Starts jaeger tracer
 */
function initTracer(serviceName: string) {
  const config = {
    serviceName: serviceName,
    sampler: { // Tracing all spans. See https://www.jaegertracing.io/docs/1.7/sampling/#client-sampling-configuration
      type: "const",
      param: 1,
    },
  };
  return initJaegerTracer(config, {});
}

/**
 * Starts a root span. For socket.io usage.
 */
module.exports.initRootSpan = (name: string, tags: ?{} = {}): Tracing => {
  const tracer = getTracer();
  const tracing = new Tracing();
  tracing.startSpan(name, { tags });
  return tracing;
}

/**
 * Returns an ExpressJS middleware that starts a span and attaches the "tracing" object to the request parameter.
 */
module.exports.tracingMiddleware = (name: string = 'express', tags: ?{}): Function => {
  const tracer = getTracer();

  return function (req: express$Request, res: express$Response, next: express$NextFunction): void {
    const tracing = new Tracing();
    tracing.startSpan(name, tags);
    req.tracing = tracing;
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

/**
 * Object implementing 
 */
class Tracing {

  /**
   * the jaeger tracer
   */
  tracer: {};
  /**
   * used to track the top span to set the parent in startSpan()
   */
  spansStack: Array<{}>;
  /**
   * index of the top stack element. To avoid using length-1
   */
  lastIndex: number;

  constructor () {
    this.tracer = getTracer();
    this.spansStack = [];
    this.lastIndex = -1;
  }

  /**
   * Starts a new span with the given name and tags.
   * The span is a child of the latest span if there is one.
   */
  startSpan(name: string, tags: ?{}): void {
    //console.log('started span', name, ', spans present', this.lastIndex+2)
    const options = {};
    if (this.lastIndex > -1) { 
      const parent = this.spansStack[this.lastIndex];
      options.childOf = parent; 
      //console.log('wid parent', parent._operationName);
    }
    if (tags != null) options.tags = tags;
    const newSpan = this.tracer.startSpan(name, options);
    this.spansStack.push(newSpan);
    this.lastIndex++;
  }
  /**
   * Tags an existing span. Used mainly for errors, by setErrorToTracingSpan()
   */
  tagSpan(name: ?string, key: string, value: string): void {
    let span;
    if (name == null) {
      span = this.spansStack[lastIndex];
    } else {
      span = this.spansStack.find(span => span._operationName === name);
    }
    span.setTag(key, value);
  }
  /**
   * Adds a log to the span. Not implemented.
   */
  logSpan(): void {

  }
  /**
   * Finishes the span with the given name. Throws an error if no span with such a name exists.
   */
  finishSpan(name: ?string): void {
    let span;
    if (name == null) {
      span = this.spansStack.pop();
    } else {
      const index = this.spansStack.findIndex(span => span._operationName === name);
      if (index < 0) throw new Error(`finishing span that does not exists "${name}"`);
      [span] = this.spansStack.splice(index, 1);
    }
    span.finish();
    this.lastIndex--;
    //console.log('finishin span wid name', name, ', spans left:', this.lastIndex+1);
  }
}
