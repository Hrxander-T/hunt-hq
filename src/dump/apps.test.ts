import { describe, it, expect } from 'vitest';
import { APP_FILES, detectPlatform, sortForPlatform } from './apps';

describe('apps', () => {
  it('detects the platform', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 16; 2025) Chrome/130')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')).toBe('linux');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('other');
  });
  it('puts this device first', () => {
    expect(sortForPlatform(APP_FILES, 'linux')[0].id).toBe('linux');
    expect(sortForPlatform(APP_FILES, 'other').map(a => a.id)).toEqual(['android', 'windows', 'linux']);
  });
});
