/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const request = require('superagent');
const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const { pubsub } = require('messages');
import type { MessageSink } from 'messages';
import type Repository  from './repository';

export type Run = {
  status: number,
  timestamp: number
};

export type WebhookState = 'active' | 'inactive';

export type WebhookUpdate = {
  state: WebhookState,
  currentRetries: number,
};

class Webhook implements MessageSink {
  id: string;
  accessId: string;
  url: string;
  state: WebhookState;

  runs: Array<Run>;
  lastRun: Run;

  runsSize: number;
  runCount: number;
  failCount: number;

  currentRetries: number;
  maxRetries: number;
  minIntervalMs: number;

  created: ?number;
  createdBy: ?string;
  modified: ?number;
  modifiedBy: ?string;

  messageBuffer: Set<string>;
  timeout: ?TimeoutID;
  isSending: boolean;

  user: ?{};
  repository: ?Repository;

  apiVersion: string;
  serial: string;

  logger;

  pubsubTurnOffListener: ?function;

  constructor(params: {
    id?: string,
    accessId: string,
    url: string,
    runCount?: number,
    failCount?: number,
    runs?: Array<Run>,
    runsSize?: number,
    lastRun: Run,
    state?: WebhookState,
    currentRetries?: number,
    minIntervalMs?: number,
    maxRetries?: number,
    created?: number,
    createdBy?: string,
    modified?: number,
    modifiedBy?: string,
    user?: {},
    webhooksRepository?: Repository,
    messageBuffer?: Set<string>
  }) {
    this.id = params.id || cuid();
    this.accessId = params.accessId;
    this.url = params.url;
    this.runCount = params.runCount || 0;
    this.failCount = params.failCount || 0;
    this.runs = params.runs || [];
    this.lastRun = params.lastRun || { status: 0, timestamp: 0 };
    this.state = params.state || 'active';
    this.currentRetries = params.currentRetries || 0;
    this.maxRetries = params.maxRetries || 5;
    this.minIntervalMs = params.minIntervalMs || 5000;
    this.created = params.created;
    this.createdBy = params.createdBy;
    this.modified = params.modified;
    this.modifiedBy = params.modifiedBy;
    this.user = params.user;
    this.repository = params.webhooksRepository;
    this.messageBuffer = params.messageBuffer || new Set();
    this.timeout = null;
    this.isSending = false;
    this.runsSize = params.runsSize || 50;
  }

 startListenting(username: string) {
    if (this.pubsubTurnOffListener != null) { throw new Error('Cannot listen twice'); }
    this.pubsubTurnOffListener = pubsub.notifications.onAndGetRemovable(username,
      function named(payload) { this.send(payload.eventName); }.bind(this)
    ); 
  }

  /**
   * Send the message with the throttling and retry mechanics - to use in webhooks service
   */
  async send(message: string, isRescheduled?: boolean): Promise<void> {
    if (this.state == 'inactive') return;

    if (isRescheduled != null && isRescheduled == true) {
      this.timeout = null;
    }
    this.messageBuffer.add(message);

    if (tooSoon.call(this) || this.isSending)
      return reschedule.call(this, message);
    this.isSending = true;

    let status: ?number;
    const sentBuffer: Array<string> = Array.from(this.messageBuffer);
    this.messageBuffer.clear();
    try {
      const res = await this.makeCall(sentBuffer);
      status = res.status;
    } catch (e) {
      if (e.response != null) {
        status = e.response.status;
      } else {
        status = 0;
      }
    }
    log(this, 'Webhook ' + this.id + ' run with status ' + status);
    this.isSending = false;

    if (hasError(status)) {
      this.failCount++;
      this.currentRetries++;
      sentBuffer.forEach(m => {
        this.messageBuffer.add(m);
      });
      if (this.currentRetries > this.maxRetries) {
        this.state = 'inactive';
      }
    } else {
      this.currentRetries = 0;
    }

    this.runCount++;
    this.lastRun = { status: status, timestamp: Date.now() / 1000 };
    this.addRun(this.lastRun);

    await makeUpdate(
      ['lastRun', 'runs', 'runCount', 'failCount', 'currentRetries', 'state'],
      this
    );

    if (hasError(status)) {
      handleRetry.call(this, message);
    }

    function hasError(status) {
      return status < 200 || status >= 300;
    }

    function handleRetry(message): void {
      if (this.state == 'inactive') {
        return;
      }
      reschedule.call(this, message);
    }

    function reschedule(message: string): void {
      if (this.timeout != null) return;
      const delay = this.minIntervalMs * (this.currentRetries || 1);
      this.timeout = setTimeout(() => {
        return this.send(message, true);
      }, delay);
    }

    function tooSoon(): boolean {
      const now = timestamp.now();
      if ((now - this.lastRun.timestamp) * 1000 < this.minIntervalMs) {
        return true;
      } else {
        return false;
      }
    }
  }

  /**
   * Only make the HTTP call - used for webhook.test API method
   */
  async makeCall(messages: Array<string>): Promise<Http$Response> {
    const res = await request.post(this.url).send({
      messages: messages,
      meta: {
        apiVersion: this.apiVersion,
        serverTime: timestamp.now(),
        serial: this.serial,
      }
    });
    return res;
  }

  stop(): void {
    if (this.timeout != null) {
      clearTimeout(this.timeout);
    }
    if (this.pubsubTurnOffListener != null) { 
      this.pubsubTurnOffListener();
      this.pubsubTurnOffListener = null;
    };
  }

  addRun(run: Run): void {
    if (this.runCount > this.runsSize) {
      this.runs.splice(-1, 1);
    } 
    this.runs.unshift(run);
  }

  async save(): Promise<void> {
    if (this.repository == null) {
      throw new Error('repository not set for Webhook object.');
    }
    
    await this.repository.insertOne(this.user, this);
  }

  async update(fieldsToUpdate: {}): Promise<void> {
    const fields = Object.keys(fieldsToUpdate);
    _.merge(this, fieldsToUpdate);
    await makeUpdate(fields, this);
  }
  
  async delete(): Promise<void> {
    if (this.repository == null) {
      throw new Error('repository not set for Webhook object.');
    }
    await this.repository.deleteOne(this.user, this.id);
  }

  getMessageBuffer(): Array<string> {
    return Array.from(this.messageBuffer);
  }

  forStorage(): {} {
    return _.pick(this, [
      'id',
      'accessId',
      'url',
      'state',
      'runCount',
      'failCount',
      'lastRun',
      'runs',
      'currentRetries',
      'maxRetries',
      'minIntervalMs',
      'created',
      'createdBy',
      'modified',
      'modifiedBy'
    ]);
  }

  forApi(): {} {
    return _.pick(this, [
      'id',
      'accessId',
      'url',
      'state',
      'runCount',
      'failCount',
      'lastRun',
      'runs',
      'currentRetries',
      'maxRetries',
      'minIntervalMs',
      'created',
      'createdBy',
      'modified',
      'modifiedBy'
    ]);
  }

  setApiVersion(version: string): void {
    this.apiVersion = version;
  }

  setSerial(serial: string): void {
    this.serial = serial;
  }

  setLogger(logger): void {
    this.logger = logger;
  }
}
module.exports = Webhook;

function log(webhook: Webhook, msg: string): void {
  if (webhook.logger == null) return;
  webhook.logger.info(msg);
}

async function makeUpdate(fields?: Array<string>, webhook: Webhook): Promise<void> {
  if (webhook.repository == null) {
    throw new Error('repository not set for Webhook object.');
  }
  let update;

  if (fields == null) {
    update = webhook.forStorage();
  } else {
    update = _.pick(webhook.forStorage(), fields);
  }
  await webhook.repository.updateOne(webhook.user, update, webhook.id);
}