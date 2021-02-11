/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const urllib = require('url');
const superagent = require('superagent');
const ErrorIds = require('errors').ErrorIds,
  errors = require('errors').factory,
  ErrorMessages = require('errors/src/ErrorMessages');

const { getLogger, notifyAirbrake } = require('@pryv/boiler');
class ServiceRegister {
  config: {}; 
  logger;

  constructor(config: {}) {
    this.config = config; 
    this.logger = getLogger('service-register');
  }

  async validateUser (
    username: String,
    invitationToken: String,
    uniqueFields: Object,
    core: String,
  ): Promise<void> {
    const url = buildUrl('/users/validate', this.config.url);
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
      if(((err.status == 409) || (err.status == 400)) && err?.response?.body?.error){
        if (err.response.body.error != null) {
          if (err.response.body.error.id === ErrorIds.InvalidInvitationToken) {
            throw errors.invalidOperation(ErrorMessages.InvalidInvitationToken);
          } else if (err.response.body.error.id === ErrorIds.ItemAlreadyExists) {
            const duplicatesSafe = ServiceRegister.safetyCleanDuplicate(err.response.body.error.data, username, uniqueFields);
            throw errors.itemAlreadyExists('user', duplicatesSafe);
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
    const url = buildUrl(`/${username}/check_username`, this.config.url);
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
    const url = buildUrl('/users', this.config.url);
    // log fact about the event
    this.logger.info(`POST ${url} for username:${user.user.username}`);
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
    fieldsToDelete: object,
    updateParams: object): Promise<void> {
    const url = buildUrl('/users', this.config.url);
    // log fact about the event
    this.logger.info(`PUT ${url} for username:${username}`);

    const request = {
      username: username,
      user: user,
      fieldsToDelete: fieldsToDelete,
    }

    try {
      const res = await superagent.put(url)
        .send(request)
        .set('Authorization', this.config.key);
      return res.body;
    } catch (err) {
      if (((err.status == 400) || (err.status == 409)) && err.response.body.error != null) {
        if (err.response.body.error.id === ErrorIds.ItemAlreadyExists) {
          throw errors.itemAlreadyExists('user', ServiceRegister.safetyCleanDuplicate(err.response.body.error.data, username, updateParams));
        } else {
          this.logger.error(err.response.body.error);
          throw errors.unexpectedError(err.response.body.error);
        }
      } if (err.status == 400 && err.response.body?.user === null) {
        // do not throw any error if no data was updated (double click for updating the event)
        this.logger.error('No data was updated');
      }else{
        // do not log validation errors
        this.logger.error(err);
        throw errors.unexpectedError(new Error(err.message || 'Unexpected error.'));
      }
    }
  }

  /**
   * Temporary solution to patch a nasty bug, where "random" emails are exposed during account creations 
   * @param {object} foundDuplicates the duplicates to check
   * @param {string} username 
   * @param {object} params 
   */
  static safetyCleanDuplicate(foundDuplicates, username, params) {
    if (! foundDuplicates) return foundDuplicates;
    const res = {};
    if (username && foundDuplicates.username) {
      if (username === foundDuplicates.username) {
        res.username = username;
      } else {
        notify('username');
      }
      delete foundDuplicates.username;
    }
    for (const key of Object.keys(foundDuplicates)) {
      if (foundDuplicates[key] === params[key]) {
        res[key] = foundDuplicates[key] ;
      } else {
        notify(key + ' "' + foundDuplicates[key] + '" <> "' + params[key] + '"');
      }
    }
    return res;

    function notify(key) {
      const logger = getLogger('service-register'); 
      const error = new Error('Found unmatching duplicate key: ' + key);
      logger.error('To be investigated >> ', error);
      notifyAirbrake(error);
    }
  }
}

function buildUrl(path: string, url): string {
  return new urllib.URL(path, url);
}

module.exports = ServiceRegister;
