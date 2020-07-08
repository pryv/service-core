/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');

function fixturePath(...elements) {
  return path.join(
    __dirname,
    './fixtures/',
    ...elements
  );
}

module.exports = {
  fixturePath,
};

