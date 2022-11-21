/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Middleware that will perform request tracing via opentacing. 
// Heavily inspired by express-opentracing.

const lodash = require('lodash');
const url = require('url');
const opentracing = require('opentracing');

const cls = require('../cls');

import type Context  from '../../context';

function tracingMiddleware(
  ctx: Context,
  req: express$Request, res: express$Response, next: express$NextFunction): mixed // eslint-disable-line no-unused-vars
{
  const Tags = opentracing.Tags;
  const tracer = ctx.tracer;
  const pathname = url.parse(req.url).pathname;
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
  
  if (res.statusCode >= 400) {
    span.setTag(Tags.ERROR, true);
    span.setTag('sampling.priority', 1);
  }
  
  span.finish();
}

function factory(ctx: Context): express$Middleware {
  return lodash.partial(tracingMiddleware, ctx);
}
module.exports = factory;