// @flow

import type { Query } from './series/series';
import type Repository from './series/repository';

import type { TypeRepository, InfluxRowType } from './types';

module.exports = {
  series: require('./series'),
  types: require('./types'),
  webhooks: {
    Webhook: require('./webhooks/Webhook'),
    Repository: require('./webhooks/repository'),
  },
};
export type { Query, Repository };
export type { TypeRepository, InfluxRowType };
