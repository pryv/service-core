// @flow

const express = require('express');

const Paths = require('./Paths');
import type Application from '../application';

function defineRoutes(expressApp: express$Application, application: Application) {
  const series = new express.Router();
  expressApp.use(Paths.Series, series);
  
  const logger = application.logFactory('express/series');
  
  series.post('/', function (req: express$Request, res) {
    logger.info('post');
    res.status(200).end(); 
  });
}
module.exports = defineRoutes;