module.exports = {
  load: function(store) {
    store.set('plugin-sync', 'plugin sync loaded');
    return 'plugin-sync'; // my name
  }
}