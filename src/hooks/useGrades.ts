import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as gradesRepo from '../db/grades.repo';

export function useTaskGrade(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['task_grade', taskId],
    queryFn: () => gradesRepo.getTaskGrade(taskId as string),
    enabled: !!taskId,
  });
}

export function useUpsertTaskGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      task_id: string;
      grade_percent: number | null;
      weight_percent: number | null;
      is_graded: boolean;
      counts: boolean;
    }) => gradesRepo.upsertTaskGrade(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['task_grade', data.task_id], exact: true });
      // Grade changes affect tasks lists (joins) and course dashboards.
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
    },
  });
}

export function useDeleteTaskGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => gradesRepo.deleteTaskGrade(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['task_grade', taskId], exact: true });
      queryClient.invalidateQueries({ queryKey: ['tasks'], exact: false });
      queryClient.refetchQueries({ queryKey: ['tasks'], exact: false, type: 'active' });
    },
  });
}

























