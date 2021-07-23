/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const { initTracer: initJaegerTracer } = require('jaeger-client');
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing');
const ah = require('./hooks');

let tracerSingleton;
function getTracer() {
  if (tracerSingleton != null) return tracerSingleton;
  tracerSingleton = initTracer('api-server');
  return tracerSingleton;
}

function initTracer(serviceName) {
  const config = {
    serviceName: serviceName,
    sampler: {
      type: "const",
      param: 1,
    },
    reporter: {
      logSpans: true,
    },
  };
  /*const options = {
    logger: {
      info(msg) {
        console.log("INFO ", msg);
      },
      error(msg) {
        console.log("ERROR", msg);
      },
    },
  };*/
  return initJaegerTracer(config, {}); //options);
}

/**
 * Starts a root span
 */
module.exports.initRootSpan = (name: string, tags: ?{}): void => {
  const tracer = getTracer();
  const tracing = new Tracing();
  tracing.startSpan(name, tags);
  return tracing;
}

/**
 * Returns an ExpressJS middleware that starts a span and attaches it to the request parameter
 */
module.exports.tracingMiddleware = (name: string = 'express', tags: ?{}): () => void => {
  const tracer = getTracer();

  return function (req, res, next): void {
    const tracing = new Tracing();
    tracing.startSpan(name, tags);
    req.tracing = tracing;
    next();
  }
}

module.exports.setErrorToTracingSpan = (spanName: string, err: Error, tracing: {}): void => {
  tracing.tagSpan(spanName, Tags.ERROR, true);
  tracing.tagSpan(spanName, 'errorId', err.id);
  tracing.tagSpan(spanName, Tags.HTTP_STATUS_CODE, err.httpStatus || 500);
}

module.exports.startApiCall = (context, params, result, next) => {
  context.tracing.startSpan(context.methodId, params);
  if (context.username != null) context.tracing.tagSpan(context.methodId, 'username', context.username);
  next();
}
module.exports.finishApiCall = (context, params, result, next) => {
  context.tracing.finishSpan(context.methodId);
  next();
}

class Tracing {

  tracer: {};
  spansStack: Array<{}>;
  lastIndex: number;

  constructor () {
    this.tracer = getTracer();
    this.spansStack = [];
    this.lastIndex = -1;
  }

  startSpan(name: string, tags: ?{}): void {
    console.log('started span', name, ', spans present', this.lastIndex+2)
    const options = {};
    if (this.lastIndex > -1) { 
      const parent = this.spansStack[this.lastIndex];
      options.childOf = parent; 
      console.log('wid parent', parent._operationName);
    }
    if (tags != null) options.tags = tags;
    const newSpan = this.tracer.startSpan(name, options);
    this.spansStack.push(newSpan);
    this.lastIndex++;
  }
  tagSpan(name: ?string, key: string, value: string): void {
    let span;
    if (name == null) {
      span = this.spansStack[lastIndex];
    } else {
      span = this.spansStack.find(span => span._operationName === name);
    }
    span.setTag(key, value);
  }
  logSpan(): void {

  }
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
    console.log('finishin span wid name', name, ', spans left:', this.lastIndex+1);
  }
}



module.exports.Tags = Tags;
module.exports.FORMAT_HTTP_HEADERS = FORMAT_HTTP_HEADERS;