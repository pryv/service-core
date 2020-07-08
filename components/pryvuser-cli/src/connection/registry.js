/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
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
    const isDryRun = (
      opts != null && 
      opts.dryRun === true);

    try {
      const res = await superagent.delete(url)
        .query({ dryRun: isDryRun })
        .query({ onlyReg: true })
        .set('Authorization', config.key);

      const body = res.body; 
      if (body.result != null) {
        const result = body.result;
        const shouldDelete = ! isDryRun;

        if (result.deleted !== shouldDelete) {
          let expect = `should have deleted '${username}', but did not.`;
          
          if (! shouldDelete) 
            expect = `should not have deleted '${username}', but did so anyway.`;

          return `Unexpected result; server ${expect}`;
        }
      }

      // Looks like we did succeed.
      return null;
    } catch (err) {
      const response = err.response;
      // Consider as a success if the user is not found on register,
      // i.e. it is already deleted. 
      if (response != null && response.body != null && response.body.id === 'NO_SUCH_USER') {
        return null;
      }
      return err.message || 'Unexpected error.';
    }

  }

  async close(): Promise<mixed> {
  }
}

module.exports = Registry;


