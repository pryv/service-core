/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Middleware that will perform request tracing via opentacing.
// Heavily inspired by express-opentracing.
const lodash = require('lodash');
const opentracing = require('opentracing');
const cls = require('../cls');
/**
 * @param {Context} ctx
 * @param {express$Request} req
 * @param {express$Response} res
 * @param {express$NextFunction} next
 * @returns {unknown}
 */
function tracingMiddleware (ctx, req, res, next // eslint-disable-line no-unused-vars
) {
  const Tags = opentracing.Tags;
  const tracer = ctx.tracer;
  const pathname = req.url.split('#')[0].split('?')[0];
  const span = tracer.startSpan(`${req.method} ${pathname || '(n/a)'}`);

  span.setTag(Tags.HTTP_METHOD, req.method);
  span.setTag(Tags.HTTP_URL, req.url);
  // include trace ID in headers so that we can debug slow requests we see in
  // the browser by looking up the trace ID found in response headers
  const responseHeaders = {};
  tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
  Object.keys(responseHeaders).forEach(key => res.setHeader(key, responseHeaders[key]));

  // Use cls to store the root span for code in this trace to use.
  cls.setRootSpan(span);

  // Hook the response 'end' function and install our handler to finish traces.
  const originalEnd = res.end;
  // (see above)
  res.end = function (...a) {
    // (see above)
    res.end = originalEnd;
    const returned = res.end.call(this, ...a);

    requestDone(span, res);

    return returned;
  };

  // Start request
  return next();
}
/**
 * @returns {void}
 */
function requestDone (span, res) {
  const Tags = opentracing.Tags;
  span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode);

  if (res.statusCode >= 400) {
    span.setTag(Tags.ERROR, true);
    span.setTag('sampling.priority', 1);
  }

  span.finish();
}
/**
 * @param {Context} ctx
 * @returns {any}
 */
function factory (ctx) {
  return lodash.partial(tracingMiddleware, ctx);
}
module.exports = factory;
