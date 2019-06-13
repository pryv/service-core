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
  timeout: Timeout;

  maxRetries: number;
  minIntervalMs: number;
  messageBuffer: Set<string>;

  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  user: {};
  storage: ?WebhooksStorage;
  NatsSubscriber: ?NatsSubscriber;

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
    this.timeout = null;
    this.messageBuffer = params.messageBuffer || new Set();
  }

  setNatsSubscriber(nsub: NatsSubscriber): void {
    this.NatsSubscriber = nsub;
  }

  async deliver(message: string) {
    await this.send(message);
    await makeUpdate([
      'runs',
      'runCount',
      'failCount',
      'currentRetries',
    ], this);
  }

  async send(message: string, isRescheduled?: boolean): Promise<void> {
    if (isRescheduled != null && isRescheduled == true) {
      this.timeout = null;
    }

    this.messageBuffer.add(message);

    if (tooSoon.call(this)) {
      return reschedule.call(this, message);
    }

    let status: ?number;
    const sentBuffer: Array<string> = Array.from(this.messageBuffer);
    this.messageBuffer.clear();
    try {
      const messages = sentBuffer;
      const res = await request.post(this.url)
        .send({
          messages: messages,
          meta: {
            apiVersion: '1.2.3'
          }
        });
      status = res.status;
      if (status >= 300) handleError.call(this, res, sentBuffer);
    } catch (e) {
      status = handleError.call(this, e.response, sentBuffer);
    }
    if (status >= 200 && status < 300) {
      this.currentRetries = 0;
    }

    this.runCount++;
    this.lastRun = { status: status, timestamp: Date.now() / 1000 };
    this.runs.push(this.lastRun);

    function handleError(response: number, sentBuffer: Array<string>): number {
      sentBuffer.forEach(m => {
        this.messageBuffer.add(m);
      });
      this.failCount++;
      handleRetry.call(this, message);
      if (response == null) return 0;
      return response.status;
    }

    function handleRetry(message): void {
      if (this.currentRetries > this.maxRetries || this.state === 'inactive') {
        this.state = 'inactive';
        return;
      }
      this.currentRetries++;
      reschedule.call(this, message);
    }

    function reschedule(message: string, ): void {
      if (this.timeout != null) return;
      const delay = this.minIntervalMs * (this.currentRetries || 1);
      this.timeout = setTimeout(async () => {
        await this.send(message, true);
      }, delay);
    }

    function tooSoon(): boolean {
      const now = timestamp.now();
      if (((now - this.lastRun.timestamp) * 1000) < this.minIntervalMs) {
        return true;
      } else {
        return false;
      }
    }
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

  const query = {};
  await bluebird.fromCallback(
    (cb) => webhook.storage.updateOne(webhook.user, query, update, cb)
  );
}