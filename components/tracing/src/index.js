/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { Tracing, DummyTracing } = require('./Tracing');
const { getHookerTracer } = require('./HookedTracer');
const dataBaseTracer = require('./databaseTracer');
const { getConfigUnsafe } = require('@pryv/boiler');
const isTracingEnabled = getConfigUnsafe(true).get('trace:enable');
const launchTags = getConfigUnsafe(true).get('trace:tags');
module.exports.DummyTracing = DummyTracing;
module.exports.dataBaseTracer = dataBaseTracer;
module.exports.getHookerTracer = getHookerTracer;
/**
 * Starts a root span. For socket.io usage.
 * @param {string} name
 * @param {{} | undefined | null} tags
 * @returns {any}
 */
function initRootSpan (name, tags = {}) {
  if (!isTracingEnabled) { return new DummyTracing(); }
  const myTags = Object.assign(Object.assign({}, launchTags), tags);
  const tracing = new Tracing();
  tracing.startSpan(name, { tags: myTags });
  return tracing;
}
module.exports.initRootSpan = initRootSpan;
/**
 * Returns an ExpressJS middleware that starts a span and attaches the "tracing" object to the request parameter.
 */
module.exports.tracingMiddleware = (name = 'express1', tags) => {
  return function (req, res, next) {
    if (req.tracing != null) {
      console.log('XXXXX tracing already set', new Error());
      return next();
    }
    const tracing = initRootSpan(name, tags);
    res.on('close', () => {
      const extra = req.context?.methodId || req.url;
      tracing.finishSpan(name, name + ':' + extra);
    });
    req.tracing = tracing;
    next();
  };
};
