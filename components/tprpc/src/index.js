/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const Server = require('./server');
const Client = require('./client');
const Definition = require('./definition');
const { RemoteError } = require('./errors');

module.exports = {
  Server, Client,
  RemoteError,
  load: Definition.load, 
};

export type { Definition };