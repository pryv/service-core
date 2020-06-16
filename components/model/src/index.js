// @flow

import type { CustomAuthFunction } from './MethodContext';

module.exports = {
  accessLogic: require('./accessLogic'),
  MethodContext: require('./MethodContext'),
};
export type { CustomAuthFunction };
