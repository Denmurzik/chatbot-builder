import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, type ApiIssue } from './client';

export interface ImportScenarioResponse {
  updatedAt: string;
  secretsToFill: number;
}

interface ErrorBody {
  message?: unknown;
  issues?: unknown;
}

// Извлекает имя файла из заголовка Content-Disposition (с приоритетом RFC 5987 filename*=UTF-8'')
export function parseContentDispositionFileName(header: string | null, fallback: string): string {
  if (!header) return fallback;

  const utf8Match = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
      if (decoded) return decoded;
    } catch {
      // некорректная percent-кодировка — пробуем обычный filename
    }
  }

  const plainMatch = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;\r\n]+)/i.exec(header);
  const rawName = (plainMatch?.[1] ?? plainMatch?.[2])?.trim();
  return rawName || fallback;
}

// Запрашивает JSON-файл экспорта сценария с сервера
export async function exportScenarioFile(
  projectId: string,
  fallbackName = 'scenario.json',
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`/api/projects/${projectId}/export`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // тело ответа не JSON
    }
    const message = typeof body.message === 'string' ? body.message : response.statusText;
    const issues = Array.isArray(body.issues) ? (body.issues as ApiIssue[]) : undefined;
    throw new ApiError(response.status, message, issues, body);
  }

  const blob = await response.blob();
  const fileName = parseContentDispositionFileName(
    response.headers.get('Content-Disposition'),
    fallbackName,
  );
  return { blob, fileName };
}

// Запускает скачивание Blob в браузере
export function triggerFileDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export function useExportScenario(projectId: string, projectName?: string) {
  const fallbackName = `${projectName?.trim() || 'scenario'}.json`;
  return useMutation({
    mutationFn: async () => {
      const { blob, fileName } = await exportScenarioFile(projectId, fallbackName);
      triggerFileDownload(blob, fileName);
      return fileName;
    },
  });
}

export function useImportScenario(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch<ImportScenarioResponse>(`/projects/${projectId}/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'], exact: true }),
  });
}
