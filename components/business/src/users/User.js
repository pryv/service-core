// @flow
const cuid = require('cuid');

class User {
  id: string;
  username: string;

  constructor(params: {
    id?: string,
    username: string,
  }) {
    this.id = params.id || cuid();
    this.username = params.username;
  }
}
module.exports = User;
