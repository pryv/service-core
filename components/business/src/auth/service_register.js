/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const urllib = require('url');
const superagent = require('superagent');

import type { RegistrySettings } from 'components/pryvuser-cli/src/configuration';

class Registry {
  config: *; 

  constructor(config: RegistrySettings) {
    this.config = config; 
  }

  _formUrl(path: string): string {
    return new urllib.URL(path, this.config.url);
  }

  async isInvitationTokenValid(invitationtoken: string): Promise<void> {
    const url = this._formUrl('/access/invitationtoken/check');
    try {
      const res = await superagent.post(url)
        .send({ invitationtoken: invitationtoken });

      if (res.text === 'true') {
        // if response is true, return that invitation Token is Valid
        return true;
      }
      // in all other cases, return that token is invalid
      return false;
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async isUserIdReserved(username: string): Promise<void> {
    const url = this._formUrl(`/users/useridIsReserved/${username}`);
    try {
      const res = await superagent.get(url)
                                  .set('Authorization', this.config.key);

      const response = res.body;
      if (response.reserved === 'true' || response.reserved === true) {
        // if response is true, return that invitation Token is Valid
        return true;
      }
      // in all other cases, return that token is invalid
      return false;
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async uidExist(username: string): Promise<void> {
    const url = this._formUrl(`/users/uidExist/${username}`);
    try {
      const res = await superagent.get(url)
                                  .set('Authorization', this.config.key);

      const response = res.body; 
      if (response == 'true' || response === true) {
        // if response is true, return that invitation Token is Valid
        return true;
      }
      // in all other cases, return that token is invalid
      return false;
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async emailExists(email: string): Promise<void> {
    const url = this._formUrl('/users/emailExists');
    try {
      const res = await superagent.post(url)
                                  .send({ 'email': email })
                                  .set('Authorization', this.config.key);

      const response = res.body; 
      if (response === 'true' || response === true) {
        // if response is true, return that invitation Token is Valid
        return true;
      }
      // in all other cases, return that token is invalid
      return false;
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async validateUser(email: String, username: String, invitationtoken: String): Promise<void> {
    const url = this._formUrl('/users/validate');
    try {
      const res = await superagent.post(url)
                                  .send({ 
                                    'email': email,
                                    'username': username,
                                    'invitationtoken': invitationtoken,
                                 })
                                  .set('Authorization', this.config.key);                           
      return res.body;
    } catch (err) {
      if(err.status == 400 && err?.response?.body?.errors){
        return err.response.body;
      }
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async checkUsername(username: string): Promise<void> {

    const url = this._formUrl(`/${username}/check_username`);
    try {
      const res = await superagent.get(url);
                              //    .send({ 'username': username });
                                //  .set('Authorization', this.config.key);
                                return res.body;
      // TODO IEVA handle failures
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

//todo ieva - promise response
// TODO IEVA -add logging
  async createUser(user): Promise<void> {
    const url = this._formUrl('/users');
    try {
      const res = await superagent.post(url)
                                  .send(user)
                                  .set('Authorization', this.config.key);
                         
      return res.body;//.success === true;
    } catch (err) {
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async close(): Promise<mixed> {
  }
}

module.exports = Registry;
