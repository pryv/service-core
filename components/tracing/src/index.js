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

module.exports.startSpan = (name: string, parent: ?{}, tags: ?{}): void => {
  const context = getContext(name + 'start');
  context.data.tracing.startSpan(name, parent, tags);
}

module.exports.finishSpan = (name: string) => {
  const context = getContext(name + 'finish');
  context.data.tracing.finishSpan(name);
}

module.exports.tagSpan = (name: string, key: string, value: string): void => {
  const context = getContext(name + 'tag' + key + value);
  context.data.tracing.tagSpan(name, key, value);
}

function getContext(name): {} {
  let context = ah.getRequestContext();
  if (context == null) {
    console.log('creatin context', name)
    context = ah.createRequestContext({
      tracing: new Tracing(),
    });
  } else { console.log('found context', name) }
  return context;
}

/**
 * Starts a root span
 */
module.exports.initRootSpan = (name: string, tags: ?{}): void => {
  const tracer = getTracer();
  const tracing = new Tracing();
    tracing.startSpan(name, null, tags);
    ah.createRequestContext({
      tracing,
    });
}

/**
 * Returns an ExpressJS middleware that starts a span and attaches it to the request parameter
 */
module.exports.tracingMiddleware = (name: string = 'express', tags: ?{}): () => void => {
  const tracer = getTracer();

  return function (req, res, next): void {
    const tracing = new Tracing();
    tracing.startSpan(name, null, tags);
    ah.createRequestContext({
      tracing,
    });
    next();
  }
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

  startSpan(name: string, parent: ?{}, tags: ?{}): void {
    console.log('start span', name, 'spans present', this.lastIndex+1)
    if (this.lastIndex > -1) parent = parent ?? this.spansStack[this.lastIndex];
    const options = {};
    if (parent != null) options.childOf = parent;
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
    console.log('finishin span wid name', name, 'spans left:', this.lastIndex+1);
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
  }
}



module.exports.Tags = Tags;
module.exports.FORMAT_HTTP_HEADERS = FORMAT_HTTP_HEADERS;