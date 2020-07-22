/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const urllib = require('url');
const superagent = require('superagent');
import type { Logger } from 'components/utils/src/logging';
import type { RegistrySettings } from 'components/pryvuser-cli/src/configuration';

class ServiceRegister {
  config: RegistrySettings; 
  logger: Logger;

  constructor(config: RegistrySettings, logger: Logger) {
    this.config = config; 
    this.logger = logger;
  }

  _formUrl(path: string): string {
    return new urllib.URL(path, this.config.url);
  }

  async validateUser(email: String, username: String, invitationtoken: String): Promise<void> {
    const url = this._formUrl('/users/validate');
    // log fact about the event
    this.logger.info(url);
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
      // do not log validation errors
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async checkUsername(username: string): Promise<void> {
    const url = this._formUrl(`/${username}/check_username`);
    // log fact about the event
    this.logger.info(url);
    try {
      const res = await superagent.get(url);
      return res.body;
    } catch (err) {
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async createUser(user): Promise<void> {
    const url = this._formUrl('/users');
    // log fact about the event
    this.logger.info(url);

    try {
      const res = await superagent.post(url)
                                  .send(user)
                                  .set('Authorization', this.config.key);
                         
      return res.body;
    } catch (err) {
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async reserveUser(key: string, core: string): Promise<void> {
    const url = this._formUrl(`/users/reservations`);
    // log fact about the event
    this.logger.info(url);

    try {
      const res = await superagent.post(url)
                                  .send({
                                    "key": key,
                                    "core": core
                                  })
                                  .set('Authorization', this.config.key);

      const response = res.body;
      if (response.success === true) {
        return true;
      }
      return false;
    } catch (err) {
      if(err.status == 400 && err.response.body.success === false){
        return false;
      }
      // do not log validation errors
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }
}

module.exports = ServiceRegister;
