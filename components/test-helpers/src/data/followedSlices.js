var accesses = require('./accesses');

module.exports = function (url) {
  return [
    {
      id: 'b_0',
      name: 'Zero\'s First Access',
      url: url,
      accessToken: accesses[1].token
    },
    {
      id: 'b_1',
      name: 'Zero\'s Second Access',
      url: url,
      accessToken: accesses[2].token
    },
    {
      id: 'b_2',
      name: 'Zero\'s Last Access',
      url: url,
      accessToken: accesses[3].token
    }
  ];
};
