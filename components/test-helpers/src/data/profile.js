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
