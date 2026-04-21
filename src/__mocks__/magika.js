const Magika = jest.fn().mockImplementation(() => ({
  load: jest.fn().mockResolvedValue(undefined),
  identifyBytes: jest.fn().mockResolvedValue({ label: 'txt', score: 0.99 }),
}));

module.exports = { Magika };
