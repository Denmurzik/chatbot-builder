import type { PendingHttpHeader } from '@chatbot/engine-core';
import type { SecretVault } from '@chatbot/vault';

// Заголовок в том виде, в каком он хранится в http_request.headers
export interface StoredHeader {
  name: string;
  value: string;
  secret: boolean;
}

// Для хранения: вместо секретного значения — маска (п. 2.13)
export function toStoredHeaders(headers: PendingHttpHeader[]): StoredHeader[] {
  return headers.map((h) => ({
    name: h.name,
    value: h.secret ? (h.secretValue?.mask ?? '') : h.value,
    secret: h.secret,
  }));
}

// Для отправки: секреты расшифровываются только в памяти. AAD — `<projectId>:<имя заголовка>`.
export function decryptHeaders(
  headers: PendingHttpHeader[],
  projectId: string,
  vault: SecretVault,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    result[h.name] =
      h.secret && h.secretValue ? vault.decrypt(h.secretValue, `${projectId}:${h.name}`) : h.value;
  }
  return result;
}
