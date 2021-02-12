/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

// Thrown when the remote code throws an error. 
// 
class RemoteError extends Error {
  constructor(message: string) {
    super(`(remote error) ${message}`);
  }
}

module.exports = {
  RemoteError
};