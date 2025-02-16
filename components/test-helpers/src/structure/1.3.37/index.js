/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
module.exports = {
  indexes: {
    accesses: [
      {
        index: { token: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: { name: 1, type: 1, deviceName: 1 },
        options: { unique: true, sparse: true }
      }
    ]
  }
};
