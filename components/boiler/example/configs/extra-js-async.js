/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


module.exports = async function() {
  await new Promise(r => setTimeout(r, 100));
  return {
    'extra-js-async': 'extra-js-async loaded'
  }
}
