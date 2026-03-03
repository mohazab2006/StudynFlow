import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as tasksRepo from '../db/tasks.repo';
import type { CreateTaskInput, UpdateTaskInput } from '../lib/types';
import type { TaskFilters } from '../db/tasks.repo';

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => tasksRepo.getAllTasks(filters),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksRepo.getTaskById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksRepo.createTask(input),
    onSuccess: () => {
      // Ensure all filtered task queries (['tasks', filters]) update immediately.
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['recurringTemplates'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => tasksRepo.updateTask(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['tasks', data.id], exact: true });
      queryClient.invalidateQueries({ queryKey: ['recurringTemplates'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
      queryClient.refetchQueries({ queryKey: ['recurringTemplates'], exact: false, type: 'active' });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tasksRepo.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['recurringTemplates'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
    },
  });
}

export function useDeleteRecurringInstanceAndFuture() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tasksRepo.deleteRecurringInstanceAndFuture(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
    },
  });
}

export function useRecurringTemplates() {
  return useQuery({
    queryKey: ['recurringTemplates'],
    queryFn: () => tasksRepo.getRecurringTemplates(),
  });
}

