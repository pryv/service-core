/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const { initTracer: initJaegerTracer } = require('jaeger-client');
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing');

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
module.exports.tracingMiddleware = (propertyName: string, tags: ?{}, log: ?{}): () => void => {
  const tracer = getTracer();

  return function (req, res, next): void {
    const span = tracer.startSpan('express');
    if (tags != null) attachTags(span, tags);
    if (log != null) span.log(log);
    req[propertyName] = span;
    next();

    function attachTags(span: {}, tags: {}): void {
      for (const [key, value] of Object.entries(tags)) {
        span.setTag(key, value);
      }
    }
  }
}



module.exports.Tags = Tags;
module.exports.FORMAT_HTTP_HEADERS = FORMAT_HTTP_HEADERS;