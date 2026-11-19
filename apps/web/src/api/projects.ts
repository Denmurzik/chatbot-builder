import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Scenario } from '@chatbot/model';
import { apiFetch } from './client';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectDetails {
  id: string;
  name: string;
  scenario: Scenario;
  updatedAt: string;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/projects'),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ id: string; name: string; scenario: Scenario }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => apiFetch<ProjectDetails>(`/projects/${id}`),
  });
}

export function useSaveScenario(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: Scenario) =>
      apiFetch<{ updatedAt: string }>(`/projects/${id}/scenario`, {
        method: 'PUT',
        body: JSON.stringify(scenario),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
