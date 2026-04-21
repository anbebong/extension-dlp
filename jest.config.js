module.exports = {
  testEnvironment: 'jsdom',
  transform: { '^.+\\.js$': 'babel-jest' },
  moduleNameMapper: {
    'webextension-polyfill': '<rootDir>/src/__mocks__/browser.js',
    magika: '<rootDir>/src/__mocks__/magika.js',
  },
};
