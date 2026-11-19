import { SecretVault } from '@chatbot/vault';
import { describe, expect, it } from 'vitest';
import { decryptHeaders, toStoredHeaders } from './http-headers';

const vault = new SecretVault(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
const secretValue = vault.encrypt('Bearer abcdefghijkl', 'proj1:Authorization');
const headers = [
  { name: 'Accept', value: 'application/json', secret: false },
  { name: 'Authorization', value: '', secret: true, secretValue },
];

describe('заголовки http_request', () => {
  it('в базу пишется маска вместо секретного значения', () => {
    const stored = toStoredHeaders(headers);
    expect(stored).toEqual([
      { name: 'Accept', value: 'application/json', secret: false },
      { name: 'Authorization', value: secretValue.mask, secret: true },
    ]);
    expect(JSON.stringify(stored)).not.toContain('abcdefghijkl');
  });

  it('для отправки секреты расшифровываются в памяти', () => {
    expect(decryptHeaders(headers, 'proj1', vault)).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer abcdefghijkl',
    });
  });
});
