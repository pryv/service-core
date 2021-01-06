/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  load: async function(store) {
    store.set('plugin-async', 'plugin async loaded');
    return 'plugin-async'; // my name
  }
}