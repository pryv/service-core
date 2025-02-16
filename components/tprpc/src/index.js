/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const Server = require('./server');
const Client = require('./client');
const Definition = require('./definition');
const { RemoteError } = require('./errors');
module.exports = {
  Server,
  Client,
  RemoteError,
  load: Definition.load
};
