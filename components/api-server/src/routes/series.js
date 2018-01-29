// @flow

const express = require('express');

const Paths = require('./Paths');
import type Application from '../application';
import type { MethodContext } from 'components/model';

class SeriesController {
  application: Application; 
  context: MethodContext; 
  
  constructor(application: Application, req: express$Request) {
    this.application = application;
        
    // FLOW Created here by the `initContextMiddleware` as defined in root.js.
    this.context = req.context;
  }
  
  // POST /events/:event_id/series (series.add)
  // 
  // Add data to an existing series. 
  // 
  addData(req: express$Request, res: express$Response) {
    res.status(200).end(); 
  }
  
  // Turns a method on the controller into an express compatible method that 
  // you can route your requests to. To allow calling a method this way, you 
  // need to add it to the `allowedMethods` in this function. 
  // 
  // Constructor of the controller is called _once_ per request, with the same
  // request and response arguments as the eventual route. 
  // 
  static _r(name: string, app: Application): express$Middleware {
    // NOTE Why the complication? Because we want to hack around the request 
    //  object just once, extracting all needed stuff and then get back into 
    //  type safety. 
    
    const allowedMethods = {
      addData: SeriesController.prototype.addData,
    };
    
    return function(req: express$Request, res: express$Response, next: express$NextFunction) {
      const controller = new SeriesController(app, req);
      const m = allowedMethods[name].bind(controller);
      
      return m(req, res, next);
    };
  }
}

function defineRoutes(expressApp: express$Application, application: Application) {
  const series = new express.Router();
  expressApp.use(Paths.Series, series);
  
  // Add data: POST /events/:event_id/series
  series.post('/', SeriesController._r('addData', application));
}
module.exports = defineRoutes;