// @flow

module.exports = {
  series: require('./series'), 
  types: require('./types'), 
};

import type { Query } from './series/series';
import type Repository from './series/repository';
export type { Query, Repository };

import type { TypeRepository, InfluxRowType } from './types';
export type { TypeRepository, InfluxRowType };