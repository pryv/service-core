// @flow

const bluebird = require('bluebird');
const request = require('superagent');
const _ = require('lodash');
const cuid = require('cuid');

const WebhooksStorage = require('components/storage').user.Webhooks;
const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';


export type Run = {
  status: number,
  timestamp: number,
};

export type WebhookState = 'active' | 'inactive';

class Webhook implements MessageSink {

  user: {};

  id: string;
  accessId: string;
  url: string;
  state: WebhookState;

  runs: Array<Run>

  runCount: number;
  failCount: number;

  currentRetries: number;

  maxRetries: number;
  minIntervalMs: number;

  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  storage: ?WebhooksStorage;
  NatsSubscriber: ?NatsSubscriber;

  constructor(params: {
    user?: {},
    id?: string,
    accessId: string,
    url: string,
    runCount?: number,
    failCount?: number,
    runs?: Array<Run>,
    state?: WebhookState,
    currentRetries?: number,
    created?: number,
    createdBy?: string,
    modified?: number,
    modifiedBy?: string,
    webhooksStorage?: WebhooksStorage,
  }) {
    this.user = params.user;
    this.id = params.id || cuid();
    this.accessId = params.accessId;
    this.url = params.url;
    this.runCount = params.runCount || 0;
    this.failCount = params.failCount || 0;
    this.runs = params.runs || [];
    this.state = params.state || 'active';
    this.currentRetries = params.currentRetries || 0;
    this.maxRetries = 5;
    this.minIntervalMs = 5000;
    this.created = params.created;
    this.createdBy = params.createdBy;
    this.modified = params.modified;
    this.modifiedBy = params.modifiedBy;
    this.NatsSubscriber = null;
    this.storage = params.webhooksStorage;
  }

  setNatsSubscriber(nsub: NatsSubscriber): void {
    this.NatsSubscriber = nsub;
  }

  stopNatsSubscriber(): void {
    if (this.NatsSubscriber == null) return;
    this.NatsSubscriber.close();
  }

  async deliver(message: string) {
    await this.send(message);
    await this.update();
  }

  async send(message: string): Promise<void> {

    let status: ?number;

    try {
      const res = await request.post(this.url)
        .send({
          message: message,
          meta: {
            apiVersion: '1.2.3'
          }
        });
      //console.log('res', res)
      status = res.status;
      if (status >= 300) handleError.call(this, res);

    } catch (e) {
      //console.log('got err', e)
      status = handleError.call(this, e.response);
    }
    this.runCount++;
    this.runs.push({ status: status, timestamp: Date.now() / 1000 });

    function handleError(response) {
      this.failCount++;
      if (response == null) return 0;
      return response.status;
    }
  }

  async save(user: any): Promise<void> {
    if (this.storage == null) {
      throw new Error('storage not set for Webhook object.');
    }

    await bluebird.fromCallback(
      (cb) => this.storage.insertOne(user, this.forStorage(), cb)
    );
  }

  async update(): Promise<void> {
    if (this.storage == null) {
      throw new Error('storage not set for Webhook object.');
    }

    const query = {};
    await bluebird.fromCallback(
      (cb) => this.storage.updateOne(this.user, query, this.forStorage(), cb)
    );
  }

  forStorage(): {} {
    return _.pick(this, [
      'id',
      'accessId',
      'url',
      'runCount',
      'failCount',
      'runs',
      'state',
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
      'runCount',
      'failCount',
      'runs',
      'state',
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