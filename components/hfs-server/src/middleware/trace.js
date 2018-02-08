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
  const Tags = opentracing.Tags;
  const tracer = ctx.tracer;
  const pathname = url.parse(req.url).pathname;
  const span = ctx.startSpan(`${req.method} ${pathname || '(n/a)'}`);
    
  span.setTag(Tags.HTTP_METHOD, req.method);
  span.setTag(Tags.HTTP_URL, req.url);

  // include trace ID in headers so that we can debug slow requests we see in
  // the browser by looking up the trace ID found in response headers
  const responseHeaders = {};
  tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
  Object.keys(responseHeaders).forEach(key => res.setHeader(key, responseHeaders[key]));
  
  // add the span to the request object for handlers to use
  req.span = span;
  
  // Hook the response 'end' function and install our handler to finish traces. 
  const originalEnd = res.end;
  // FLOW (see above)
  res.end = function(...a) {
    // FLOW (see above)
    res.end = originalEnd;
    const returned = res.end.call(this, ...a);
    
    requestDone(span, res);
    
    return returned;
  };
  
  // Start request
  return next(); 
}

function requestDone(span, res) {
  const Tags = opentracing.Tags;

  span.setTag(Tags.HTTP_STATUS_CODE, res.statusCode);
  
  if (res.statusCode >= 500) {
    span.setTag(Tags.ERROR, true);
    span.setTag('sampling.priority', 1);
  }
  
  span.finish();
}

function factory(ctx: Context): express$Middleware {
  return lodash.partial(tracingMiddleware, ctx);
}
module.exports = factory;