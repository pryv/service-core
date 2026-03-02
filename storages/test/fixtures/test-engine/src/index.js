/**
 * Test engine for pluginLoader unit tests.
 */
module.exports = {
  async createBaseStorage (config, internals) {
    return { type: 'baseStorage', config, internals };
  },
  async createPlatformStorage (config, internals) {
    return { type: 'platformStorage', config, internals };
  }
};
