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
  deleteUser(username: string): Promise<void> {
    username;
    throw new Error('Not Implemented');
  }

  /// Calls registry (DELETE /user/id) to delete the user. Retries the call 
  /// if it fails. If given the option 'dryRun', it will instruct registry
  /// to check if a deletion could happen without really performing it.
  /// 
  /// In case of error, returns the (error) message to display to the user. If
  /// all is well, returns `null`.
  /// 
  async userDeleteRequest(
    username: string, opts: DeleteRequestOptions
  ): Promise<?string> {
    opts; 
    const config = this.config;
    const url = new urllib.URL(`/users/${username}`, config.url);

    const res = await superagent.delete(url)
      .query({ dryRun: opts.dryRun === true });

    // On success, return null
    if (res.status == 200) return null; 

    switch (res.status) {
      case 403: return 'Cannot access registry, forbidden.'; 
    }

    return 'Unknown error.';
  }
}

module.exports = Registry;


