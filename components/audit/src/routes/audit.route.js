/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');

const Result = require('api-server/src/Result');
const methodCallback = require('api-server/src/routes/methodCallback');
const Paths = require('api-server/src/routes/Paths');
const middleware = require('middleware');
const { setMethodId } = require('middleware');
const audit = require('audit');

import type Application  from 'api-server/src/application';

const auditStorage = audit.storage;

// Event streams route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  
  expressApp.get(Paths.Audit, 
    setMethodId('auditLogs.get'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      // TODO filter params
      const params = req.query;
      const callback = methodCallback(res, next, 200);
      try {
        const userStorage = auditStorage.forUser(req.context.user.id);
        
        const result = new Result();
        result.auditLogs = userStorage.getLogs(params);
        callback(null, result);
      } catch (err) {
        return callback(err);
      }      
  });

};
