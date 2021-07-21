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
module.exports.ah = ah;

let tracerSingleton;
function getTracer() {
  if (tracerSingleton != null) return tracerSingleton;
  tracerSingleton = initTracer('api-server');
  return tracerSingleton;
}
module.exports.getTracer = getTracer;

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
 * Returns an ExpressJS middleware that starts a span and attaches it to the request parameter
 * 
 * @param {*} spanName 
 * @param {*} propertyName 
 */
module.exports.tracingMiddleware = (spanName: string = 'express', tags: ?{}, log: ?{}): () => void => {
  const tracer = getTracer();

  return function (req, res, next): void {
    const tracing = new Tracing();
    tracing.startSpan('express', null, tags);
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
    console.log('start span', name)
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
  logSpan(log: {}): void {

  }
  finishSpan(name: ?string): {} {
    console.log('finishin span wid name', name);
    let span;
    if (name == null) {
      span = this.spansStack.pop();
    } else {
      const index = this.spansStack.findIndex(span => span._operationName === name);
      if (index < 0) throw new Error(`finishing span that does not exists ${name}`);
      [span] = this.spansStack.splice(index, 1);
    }
    span.finish();
    this.lastIndex--;
  }
}



module.exports.Tags = Tags;
module.exports.FORMAT_HTTP_HEADERS = FORMAT_HTTP_HEADERS;