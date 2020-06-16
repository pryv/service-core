module.exports = {
  indexes: {
    accesses: [
      {
        index: { token: 1 },
        options: { unique: true, sparse: true },
      },
      {
        index: { name: 1, type: 1, deviceName: 1 },
        options: { unique: true, sparse: true },
      },
    ],
  },
};
