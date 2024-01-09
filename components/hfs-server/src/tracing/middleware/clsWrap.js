/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Express middleware that makes sure we have a continuation local storage
// context for each express request.
const cls = require('../cls');
/**
 * @param {express$Request} req
 * @param {express$Response} res
 * @param {express$NextFunction} next
 * @returns {any}
 */
function clsWrap (req, res, next) {
  return cls.startExpressContext(req, res, next);
}
/**
 * @returns {any}
 */
function factory () {
  return clsWrap;
}
module.exports = factory;
