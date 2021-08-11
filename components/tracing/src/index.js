/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow



const { Tracing, DummyTracing } = require('./Tracing');
const { getHookerTracer } = require('./HookedTracer');

const expressTracer = require('./expressTracer');
const dataBaseTracer = require('./databaseTracer');
const { getConfigUnsafe } = require('@pryv/boiler');
const isTracingEnabled = getConfigUnsafe(true).get('trace:enable');


module.exports.DummyTracing = DummyTracing;


module.exports.dataBaseTracer = dataBaseTracer;
module.exports.getHookerTracer = getHookerTracer;

/**
 * Starts a root span. For socket.io usage.
 */
function initRootSpan (name: string, tags: ?{} = {}): Tracing {
  if (! isTracingEnabled) return new DummyTracing();
  const tracing = new Tracing();
  tracing.startSpan(name, { tags });
  setTimeout(() => { 
    tracing.checkIfFinished();
  }, 5000);
  return tracing;
};
module.exports.initRootSpan = initRootSpan;


/**
 * Returns an ExpressJS middleware that starts a span and attaches the "tracing" object to the request parameter.
 */
function tracingMiddleware (name: string = 'express1', tags: ?{}): Function  {
  return function (req: express$Request, res: express$Response, next: express$NextFunction): void {
    if (req.tracing != null) { console.log('XXXXX tracing already set', new Error()); return next();}
    const tracing = initRootSpan (name, tags);
    res.on('close', () => { 
      const extra = req.context?.methodId || req.url;
      tracing.finishSpan(name , name + ':' + extra); 
    })
    req.tracing = tracing;
    next();
  }
}

module.exports.initExpressTracer = function(app) {
  app.use(tracingMiddleware()); // anyway .. initRootSpan will retrun a dummytracer is not enabled
  if (isTracingEnabled) expressTracer(app);
}