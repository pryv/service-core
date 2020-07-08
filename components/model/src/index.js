/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

module.exports = {
  accessLogic: require('./accessLogic'),
  MethodContext: require('./MethodContext')
};

import type { CustomAuthFunction } from './MethodContext';
export type { CustomAuthFunction };