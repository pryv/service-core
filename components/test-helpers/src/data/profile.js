/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var accesses = require('./accesses');
module.exports = [
  {
    id: 'public',
    data: {
      keyOne: 'value One',
      keyTwo: 2,
      keyThree: true,
      keyFour: [1, 2, 3, 4],
      keyFive: { giveMe: 5 }
    }
  },
  {
    id: 'private',
    data: {
      keyOne: 'value One',
      keyTwo: 2,
      keyThree: true,
      keyFour: [1, 2, 3, 4],
      keyFive: { giveMe: 5 }
    }
  },
  {
    id: accesses[4].name, // app profile
    data: {
      keyOne: 'value One',
      keyTwo: 2,
      keyThree: true,
      keyFour: [1, 2, 3, 4],
      keyFive: { giveMe: 5 }
    }
  }
];
