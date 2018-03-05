// @flow

const errors = require('components/errors').factory;
const business = require('components/business');

import type Context from '../context';

// ----------------------------------------------- (sync) express error handling

type ControllerMethod = (ctx: Context, 
  req: express$Request, res: express$Response, next: express$NextFunction) => mixed; 
type ExpressHandler = (req: express$Request, res: express$Response, next: express$NextFunction) => mixed; 
function mount(ctx: Context, handler: ControllerMethod): express$Middleware {
  return catchAndNext(
    handler.bind(null, ctx)); 
}

function catchAndNext(handler: ExpressHandler): express$Middleware {
  return async (req: express$Request, res, next) => {
    try {
      return await handler(req, res, next);
    }
    catch (err) {
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

// --------------------------------------------------------------------- factory

module.exports = function (ctx: Context) {
  return {
    storeSeriesData: mount(ctx, require('./op/store_series_data')),
    querySeriesData: mount(ctx, require('./op/query_series_data')),
    storeSeriesBatch: mount(ctx, require('./op/store_series_batch')),
  };
};