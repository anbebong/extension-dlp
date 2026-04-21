module.exports = {
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: { getURL: (p) => `chrome-extension://test/${p}` },
  downloads: { onCreated: { addListener: jest.fn() }, cancel: jest.fn() },
  notifications: { create: jest.fn() },
  alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
};
