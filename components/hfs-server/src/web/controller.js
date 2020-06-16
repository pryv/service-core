// @flow

import type Context from '../context';

const errors = require('components/errors').factory;
const business = require('components/business');

const opentracing = require('opentracing');
const cls = require('../tracing/cls');

// ----------------------------------------------- (sync) express error handling

type ControllerMethod = (ctx: Context,
  req: express$Request, res: express$Response, next: express$NextFunction) => mixed;
type ExpressHandler = (req: express$Request, res: express$Response, next: express$NextFunction) => mixed;
function mount(ctx: Context, handler: ControllerMethod): express$Middleware {
  return catchAndNext(
    handler.bind(null, ctx),
  );
}

function catchAndNext(handler: ExpressHandler): express$Middleware {
  return async (req: express$Request, res, next) => {
    try {
      return await handler(req, res, next);
    } catch (err) {
      storeErrorInTrace(err);

      if (err.constructor.name === 'ServiceNotAvailableError') {
        return next(errors.apiUnavailable(err.message));
      }
      if (err instanceof business.types.errors.InputTypeError) {
        return next(errors.invalidRequestStructure(err.message));
      }

      next(err);
    }
  };
}

const TAG_ERROR_MESSAGE = 'error.message';

// Tries to store the current error in the active trace. Traces are then
// all closed down by the 'trace' middleware, yielding a correct error trace
// in every case.
//
// NOTE This method should not throw an error!
//
function storeErrorInTrace(err: any) {
  try {
    const { Tags } = opentracing;

    const root = cls.getRootSpan();
    if (root == null) return;

    root.setTag(Tags.ERROR, true);
    if (err.message != null) root.setTag(TAG_ERROR_MESSAGE, err.message);
  } catch (err) {
    // IGNORE
  }
}

// --------------------------------------------------------------------- factory

module.exports = function (ctx: Context) {
  return {
    storeSeriesData: mount(ctx, require('./op/store_series_data')),
    querySeriesData: mount(ctx, require('./op/query_series_data')),
    storeSeriesBatch: mount(ctx, require('./op/store_series_batch')),
  };
};
