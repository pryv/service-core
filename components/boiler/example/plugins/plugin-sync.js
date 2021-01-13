/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  load: function(store) {
    store.set('plugin-sync', 'plugin sync loaded');
    return 'plugin-sync'; // my name
  }
}