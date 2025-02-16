/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const path = require('path');
const rpc = require('tprpc');
module.exports = {
  produce: () => rpc.load(path.join(__dirname, '/interface.proto'))
};
