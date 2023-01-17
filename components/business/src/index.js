/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  accesses: require('./accesses'),
  series: require('./series'),
  types: require('./types'),
  integrity: require('./integrity'),
  webhooks: {
    Webhook: require('./webhooks/Webhook'),
    Repository: require('./webhooks/repository')
  },
  users: require('./users'),
  MethodContext: require('./MethodContext')
};
