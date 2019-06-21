// @flow

const bluebird = require('bluebird');
const request = require('superagent');
const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const WebhooksStorage = require('components/storage').user.Webhooks;
const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';


export type Run = {
  status: number,
  timestamp: number,
};

export type WebhookState = 'active' | 'inactive';

class Webhook implements MessageSink {

  id: string;
  accessId: string;
  url: string;
  state: WebhookState;

  runs: Array<Run>;
  lastRun: Run;

  runCount: number;
  failCount: number;

  currentRetries: number;
  maxRetries: number;
  minIntervalMs: number;

  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  messageBuffer: Set<string>;
  timeout: Timeout;
  isSending: boolean;

  user: {};
  storage: ?WebhooksStorage;
  NatsSubscriber: ?NatsSubscriber;
  apiVersion: string;

  constructor(params: {
    id?: string,
    accessId: string,
    url: string,
    runCount?: number,
    failCount?: number,
    runs?: Array<Run>,
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
    webhooksStorage?: WebhooksStorage,
    messageBuffer?: Set<string>,
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
    this.storage = params.webhooksStorage;
    this.NatsSubscriber = null;
    this.messageBuffer = params.messageBuffer || new Set();
    this.timeout = null;
    this.isSending = false;
  }

  setNatsSubscriber(nsub: NatsSubscriber): void {
    this.NatsSubscriber = nsub;
  }

  /**
   * Send message and update the webhook in the storage
   */
  async deliver(username: string, message: string): Promise<void> {
    await this.send(message);
  }

  /**
   * Send the message with the throttling and retry mechanics - to use in webhooks service
   */
  async send(message: string, isRescheduled?: boolean): Promise<void> {
    if (isRescheduled != null && isRescheduled == true) {
      this.timeout = null;
    }
    this.messageBuffer.add(message);

    if (tooSoon.call(this) || this.isSending) return reschedule.call(this, message);
    this.isSending = true;

    let status: ?number;
    const sentBuffer: Array<string> = Array.from(this.messageBuffer);
    this.messageBuffer.clear();
    try {
      const messages = sentBuffer;
      const res = await this.makeCall(messages);
      status = res.status;
    } catch (e) {
      if (e.response != null) {
        status = e.response.status;
      } else {
        status = 0;
      }
    }
    this.isSending = false;

    if (hasError(status)) {
      this.failCount++;
      this.currentRetries++;
      sentBuffer.forEach(m => {
        this.messageBuffer.add(m);
      });
    } else {
      this.currentRetries = 0;
    }

    this.runCount++;
    this.lastRun = { status: status, timestamp: Date.now() / 1000 };
    this.runs.push(this.lastRun);

    await makeUpdate([
      'lastRun',
      'runs',
      'runCount',
      'failCount',
      'currentRetries',
      'state',
    ], this);

    if (hasError(status)) {
      handleRetry.call(this, message);
    }

    function hasError(status) {
      return (status < 200) || (status >= 300);
    }

    function handleRetry(message): void {
      if (this.currentRetries > this.maxRetries || this.state === 'inactive') {
        this.state = 'inactive';
        return;
      } 
      reschedule.call(this, message);
    }

    function reschedule(message: string, ): void {
      if (this.timeout != null) return;
      const delay = this.minIntervalMs * (this.currentRetries || 1);
      this.timeout = setTimeout(() => {
          return this.send(message, true);
        }
        //await 
        /*process.nextTick((message, bool) => {
          this.send(message, bool)
          }, message, true);*/
      , delay);
    }

    /**
    setTimeout(this.send.bind(this, message, true), delay);
     */

     /**
     setTimeout(() => {
          return this.send(message, true);
        }, delay);
      */

    function tooSoon(): boolean {
      const now = timestamp.now();
      if (((now - this.lastRun.timestamp) * 1000) < this.minIntervalMs) {
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
    const res = await request.post(this.url)
      .send({
        messages: messages,
        meta: {
          apiVersion: this.apiVersion,
          serverTime: timestamp.now(),
        }
      });
    return res;
  }

  stop(): void {
    if (this.timeout != null) {
      clearTimeout(this.timeout);
    }
    if (this.NatsSubscriber != null) {
      this.NatsSubscriber.close();
    }
  }

  async save(): Promise<void> {
    if (this.storage == null) {
      throw new Error('storage not set for Webhook object.');
    }

    await bluebird.fromCallback(
      (cb) => this.storage.insertOne(this.user, this.forStorage(), cb)
    );
  }

  async update(fieldsToUpdate: {}): Promise<void> {
    const fields = Object.keys(fieldsToUpdate);
    _.merge(this, fieldsToUpdate);
    await makeUpdate(fields, this);
  }

  async delete(): Promise<void> {
    if (this.storage == null) {
      throw new Error('storage not set for Webhook object.');
    }
    await bluebird.fromCallback(
      (cb) => this.storage.delete(this.user, { id: this.id }, cb)
    );
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
      'modifiedBy',
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
      'modifiedBy',
    ]);
  }

  setApiVersion(version) {
    this.apiVersion = version;
  }

}
module.exports = Webhook;

async function makeUpdate(fields?: Array<string>, webhook: Webhook): Promise<void> {
  if (webhook.storage == null) {
    throw new Error('storage not set for Webhook object.');
  }
  let update;

  if (fields == null) {
    update = webhook.forStorage();
  } else {
    update = _.pick(webhook.forStorage(), fields);
  }
  const query = { id: webhook.id };
  await bluebird.fromCallback(
    (cb) => webhook.storage.updateOne(webhook.user, query, update, cb)
  );
}