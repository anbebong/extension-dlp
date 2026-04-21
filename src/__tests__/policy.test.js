import { isDomainBlocked, isExtensionBlocked, isMimeTypeBlocked, DEFAULT_POLICY } from '../background/policy.js';

const policy = {
  ...DEFAULT_POLICY,
  blockedDomains: ['evil.com', '*.malware.org'],
  blockedExtensions: ['.exe', '.bat', '.ps1'],
  blockedMimeTypes: ['application/x-msdownload', 'exe'],
};

describe('isDomainBlocked', () => {
  test('blocks exact domain', () => {
    expect(isDomainBlocked('https://evil.com/file.zip', policy)).toBe(true);
  });
  test('blocks wildcard subdomain', () => {
    expect(isDomainBlocked('https://sub.malware.org/file', policy)).toBe(true);
  });
  test('blocks wildcard base domain', () => {
    expect(isDomainBlocked('https://malware.org/file', policy)).toBe(true);
  });
  test('allows safe domain', () => {
    expect(isDomainBlocked('https://google.com/file', policy)).toBe(false);
  });
  test('handles invalid URL', () => {
    expect(isDomainBlocked('not-a-url', policy)).toBe(false);
  });
});

describe('isExtensionBlocked', () => {
  test('blocks .exe', () => {
    expect(isExtensionBlocked('malware.exe', policy)).toBe(true);
  });
  test('blocks case-insensitive', () => {
    expect(isExtensionBlocked('VIRUS.EXE', policy)).toBe(true);
  });
  test('allows .pdf', () => {
    expect(isExtensionBlocked('report.pdf', policy)).toBe(false);
  });
  test('handles no extension', () => {
    expect(isExtensionBlocked('noext', policy)).toBe(false);
  });
  test('blocks disguised file', () => {
    expect(isExtensionBlocked('photo.jpg.exe', policy)).toBe(true);
  });
});

describe('isMimeTypeBlocked', () => {
  test('blocks exact MIME', () => {
    expect(isMimeTypeBlocked('application/x-msdownload', policy)).toBe(true);
  });
  test('blocks Magika label', () => {
    expect(isMimeTypeBlocked('exe', policy)).toBe(true);
  });
  test('allows PDF', () => {
    expect(isMimeTypeBlocked('application/pdf', policy)).toBe(false);
  });
  test('handles null', () => {
    expect(isMimeTypeBlocked(null, policy)).toBe(false);
  });
});
