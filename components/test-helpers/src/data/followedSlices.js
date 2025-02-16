/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const accesses = require('./accesses');

module.exports = function (url) {
  return [
    {
      id: 'b_0',
      name: 'Zero\'s First Access',
      url,
      accessToken: accesses[1].token
    },
    {
      id: 'b_1',
      name: 'Zero\'s Second Access',
      url,
      accessToken: accesses[2].token
    },
    {
      id: 'b_2',
      name: 'Zero\'s Last Access',
      url,
      accessToken: accesses[3].token
    }
  ];
};
