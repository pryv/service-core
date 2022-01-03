/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

// Express middleware that makes sure we have a continuation local storage 
// context for each express request. 

const cls = require('../cls');

function clsWrap(req: express$Request, res: express$Response, next: express$NextFunction) {
  return cls.startExpressContext(req, res, next);
}

function factory(): express$Middleware {
  return clsWrap;
}
module.exports = factory;