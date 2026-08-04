import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push-key';

describe('urlBase64ToUint8Array', () => {
  it('decodes a padded standard-alphabet key', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });

  it('restores stripped padding', () => {
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1]);
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2]);
  });

  it('translates the URL-safe alphabet back to standard base64', () => {
    const urlSafe = '-_8';
    expect(Array.from(urlBase64ToUint8Array(urlSafe))).toEqual([251, 255]);
  });

  it('decodes a 65-byte VAPID public key', () => {
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const decoded = urlBase64ToUint8Array(key);
    expect(decoded).toHaveLength(65);
    expect(decoded[0]).toBe(4);
  });
});
