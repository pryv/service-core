/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
// Thrown when the remote code throws an error.
//
class RemoteError extends Error {
  constructor (message) {
    super(`(remote error) ${message}`);
  }
}
module.exports = {
  RemoteError
};
