import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as repo from '../db/taskTypes.repo';

export function useTaskTypes() {
  return useQuery({
    queryKey: ['taskTypes'],
    queryFn: () => repo.getTaskTypes(),
  });
}

export function useCreateTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) => repo.createTaskType(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taskTypes'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; color?: string }) => repo.updateTaskType(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taskTypes'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteTaskType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taskTypes'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}


























