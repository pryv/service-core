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
const ErrorIds = require('components/errors').ErrorIds,
  errors = require('components/errors').factory,
  ErrorMessages = require('components/errors/src/ErrorMessages');
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

  async validateUser (
    username: String,
    invitationToken: String,
    uniqueFields: Object,
    core: String,
  ): Promise<void> {
    const url = this._formUrl('/users/validate');
    // log fact about the event
    this.logger.info(`POST ${url} for username: ${username}`);
    try {
      await superagent
        .post(url)
        .set('Authorization', this.config.key)
        .send({ 
          username: username,
          invitationToken: invitationToken,
          uniqueFields: uniqueFields,
          core: core
        });
    } catch (err) {
      if(err.status == 400 && err?.response?.body?.error){
        if (err.response.body.error != null) {
          if (err.response.body.error.id === ErrorIds.InvalidInvitationToken) {
            throw errors.invalidOperation(ErrorMessages.InvalidInvitationToken);
          } else if (err.response.body.error.id === ErrorIds.ItemAlreadyExists) {
            throw errors.itemAlreadyExists('user', err.response.body.error.data);
          } else {
            throw errors.unexpectedError(err.response.body.error);
          }
        }
      }
      // do not log validation errors
      this.logger.error(err);
      throw errors.unexpectedError(new Error(err.message || 'Unexpected error.'));
    }
  }

  async checkUsername(username: string): Promise<any> {
    const url = this._formUrl(`/${username}/check_username`);
    // log fact about the event
    this.logger.info(`GET ${url} for username: ${username}`);
    try {
      const res = await superagent
        .get(url);
      return res.body;
    } catch (err) {
      if (err?.response?.body?.reserved === true) {
        return err.response.body;
      }
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  async createUser(user): Promise<void> {
    const url = this._formUrl('/users');
    // log fact about the event
    this.logger.info(`POST ${url} for username:${user.username}`);
    try {
      const res = await superagent
        .post(url)
        .set('Authorization', this.config.key)
        .send(user);     
      return res.body;
    } catch (err) {
      this.logger.error(err);
      throw new Error(err.message || 'Unexpected error.');
    }
  }

  /**
   * After indexed fields are updated, service-register is notified to update
   * the information
   */
  async updateUserInServiceRegister (
    username: string,
    user: object,
    fieldsToDelete: object): Promise<void> {
    const url = this._formUrl('/users');
    // log fact about the event
    this.logger.info(`PUT ${url} for username:${username}`);
    user.username = username;

    const request = {
      user: user,
      fieldsToDelete: fieldsToDelete,
    }

    try {
      const res = await superagent.put(url)
        .send(request)
        .set('Authorization', this.config.key);

      return res.body;
    } catch (err) {
      if (err.status == 400 && err.response.body.error != null) {
        if (err.response.body.error.id === ErrorIds.ItemAlreadyExists) {
          throw errors.itemAlreadyExists('user', err.response.body.error.data);
        } else {
          this.logger.error(err.response.body.error);
          throw errors.unexpectedError(err.response.body.error);
        }
      }
      // do not log validation errors
      this.logger.error(err);
      throw errors.unexpectedError(new Error(err.message || 'Unexpected error.'));
    }
  }
}

module.exports = ServiceRegister;
