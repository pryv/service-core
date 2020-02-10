// @flow

const nock = require('nock');

class Mock {
//   scope: any;

  constructor(endpoint: string, path: string, method: string, status: number, res: Object, cb: () => any) {
    const url = require('url');
    console.log('---- new Mock ---\nlistening to ', url.resolve(endpoint, path));
    nock(endpoint)
      .persist()
      .intercept(path, method)
      // .post(path)
      .reply(function () {
        console.log('--------------- SMTHING ????');
        cb();
        return [status, res];
      });
    console.log('---- new Mock ok ---');
  }

  stop() {
    // Should work but doesn't
    // https://www.npmjs.com/package/nock#persist
    // this.scope.persist(false);
    
    nock.cleanAll();
  }
}

module.exports = Mock;
