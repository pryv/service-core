/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const rpc = require('tprpc');

module.exports = {
  produce: () => rpc.load(__dirname + '/interface.proto'),
};
