import { describe, expect, it } from 'vitest';
import { captureFileName, captureSupported } from './capture';

describe('capture', () => {
  it('names files by time with milliseconds, so two captures in one second differ', () => {
    const a = captureFileName(new Date(2026, 9, 10, 14, 5, 9, 7)), b = captureFileName(new Date(2026, 9, 10, 14, 5, 9, 8));
    expect(a).toBe('capture-140509-007.png');
    expect(a).not.toBe(b);
  });
  it('says capture is not supported where there is no screen sharing (this test runs in Node)', () => {
    expect(captureSupported()).toBe(false);
  });
});
