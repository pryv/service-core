// @flow

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const request = require('superagent');

export type Run = {
  statusCode: number,
  timestamp: number,
};

export type WebhookState = 'Active' | 'Invactive';

class Webhook {

  accessId: string;
  url: string;
  state: WebhookState;

  runsArray: Array<Run>

  runCount: number;
  failCount: number;

  currentRetries: number;

  maxRetries: number;
  maxRateMs: number;

  NatsSubscriber: ?NatsSubscriber;

  constructor(params: {
    accessId: string,
    url: string,
    runCount?: number,
    failCount?: number,
    runsArray?: Array<Run>,
    state?: WebhookState,
    currentRetries?: number,
  }) {
    this.accessId = params.accessId;
    this.url = params.url;
    this.runCount = params.runCount || 0;
    this.failCount = params.failCount || 0;
    this.runsArray = params.runsArray || [];
    this.state = params.state || 'Active';
    this.currentRetries = params.currentRetries || 0;
    this.maxRetries = 5;
    this.maxRateMs = 5000;
    this.NatsSubscriber = null;
  }

  setNatsSubscriber(nsub: NatsSubscriber): void {
    this.NatsSubscriber = nsub;
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
      if (status >= 300) handleError(res);

    } catch (e) {
      console.log('got err', e)
      status = handleError(e.response);
    }
    this.runCount++;
    this.runsArray.push({statusCode: status, timestamp: Date.now() / 1000 });

    function handleError(response) {
      //this.failCount++;
      return response.status;
    }
  }


}
module.exports = Webhook;