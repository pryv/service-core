module.exports = {
  daemon: false,

  pidFile: 'nginx.pid',
  workerProcesses: 1,
  workerConnections: 512,

  errorLog: '/dev/stderr',
  accessLog: '/dev/stdout',

  port: 2000,
  serverName: 'localhost',
  ssl: {
    enabled: false
  },

  api: {
    port: 3000,
    root: __dirname + '/../components/api-server'
  },
  previews: {
    port: 3001,
    root: __dirname + '/../components/previews-server'
  }
};
