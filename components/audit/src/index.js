/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Audit = require('./Audit');
const audit = new Audit();

audit.CONSTANTS = require('./Constants');

module.exports = audit;
