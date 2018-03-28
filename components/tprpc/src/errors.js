
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