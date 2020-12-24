/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const boiler = require('../src');
const config = boiler.init({appName: 'sample-double-init'});

boiler.init({appName: 'sample-double-init2'});