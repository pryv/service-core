module.exports = {
  load: async function(store) {
    store.set('plugin-async', 'plugin async loaded');
    return 'plugin-async'; // my name
  }
}