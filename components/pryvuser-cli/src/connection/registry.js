// @flow

const urllib = require('url');
const superagent = require('superagent');

import type { RegistrySettings } from '../configuration';

export type DeleteRequestOptions = {
  dryRun?: boolean, 
};

class Registry {
  config: *; 

  constructor(config: RegistrySettings) {
    this.config = config; 
  }

  async preflight(username: string): Promise<void> {
    const errorMsg = await this.userDeleteRequest(username, {dryRun: true});

    if (errorMsg != null)
      throw new Error(errorMsg);
  }
  async deleteUser(username: string): Promise<void> {
    const errorMsg = await this.userDeleteRequest(username);

    if (errorMsg != null)
      throw new Error(errorMsg);
  }

  /// Calls registry (DELETE /user/id) to delete the user. Retries the call 
  /// if it fails. If given the option 'dryRun', it will instruct registry
  /// to check if a deletion could happen without really performing it.
  /// 
  /// In case of error, returns the (error) message to display to the user. If
  /// all is well, returns `null`.
  /// 
  async userDeleteRequest(
    username: string, opts?: DeleteRequestOptions
  ): Promise<?string> {
    const config = this.config;
    const url = new urllib.URL(`/users/${username}`, config.url);

    const res = await superagent.delete(url)
      .query({ dryRun: opts != null && opts.dryRun === true })
      .query({ onlyReg: true })
      .set('Authorization', config.key);

    // On success, return null
    if (res.status == 200) return null; 

    return 'Unknown error.';
  }
}

module.exports = Registry;


