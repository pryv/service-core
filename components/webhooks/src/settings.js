// @flow
const nconf = require('nconf');

const { NATS_CONNECTION_URI } = require('components/utils').messaging;

class Settings {
  config: Object;

  constructor() {
    this.config = nconf;
    const config = nconf;
    config.env().argv();

    const configFile = config.get('config') || 'dev-config.json';
    config.file({ file: configFile });

    config.defaults({
      logs: {
        prefix: '',
        console: { active: true, level: 'info', colorize: true },
        file: { active: false },
        airbrake: {
          active: false,
          projectId: '',
          key: '',
        },
      },
      mongodb: {
        host: '127.0.0.1',
        port: 27017,
        name: 'pryv-node',
        authUser: '',
        authPassword: '',
      },
      nats: {
        uri: NATS_CONNECTION_URI,
      },
      service: {
        info: {
          serial: '20190101',
        },
      },
    });
  }

  get(key) {
    return this.config.get(key);
  }
}
module.exports = Settings;
