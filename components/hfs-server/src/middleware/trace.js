// @flow

// Middleware that will perform request tracing via opentacing. 
// Heavily inspired by express-opentracing.

const lodash = require('lodash');
const url = require('url');
const opentracing = require('opentracing');

import type Context from '../context';

opaque type RequestWithSpan = express$Request & {
  span: opentracing.Span,
}

function tracingMiddleware(
  ctx: Context,
  req: RequestWithSpan, res: express$Response, next: express$NextFunction): mixed // eslint-disable-line no-unused-vars
{
  const tracer = ctx.tracer;
  const pathname = url.parse(req.url).pathname;
  const span = ctx.startSpan(pathname);
    
  span.setTag('http.method', req.method);
  span.setTag('http.url', req.url);

  // include trace ID in headers so that we can debug slow requests we see in
  // the browser by looking up the trace ID found in response headers
  const responseHeaders = {};
  tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
  Object.keys(responseHeaders).forEach(key => res.setHeader(key, responseHeaders[key]));
  
  // add the span to the request object for handlers to use
  req.span = span;
  
  // Start request
  next(); 
  
  requestDone(span, res);
}

function requestDone(span, res) {
  span.logEvent('request/done');
  
  span.setTag('http.statusCode', res.statusCode);
  
  if (res.statusCode >= 500) {
    span.setTag('error', true);
    span.setTag('sampling.priority', 1);
  }
  span.finish();
}

function factory(ctx: Context): express$Middleware {
  return lodash.partial(tracingMiddleware, ctx);
}
module.exports = factory;