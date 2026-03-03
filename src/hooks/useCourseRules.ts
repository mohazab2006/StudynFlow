import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as courseRulesRepo from '../db/courseRules.repo';
import type { CourseRuleType } from '../lib/types';

export function useCourseRules(courseId: string | null) {
  return useQuery({
    queryKey: ['course_rules', courseId],
    queryFn: () => courseRulesRepo.getCourseRules(courseId!),
    enabled: !!courseId,
  });
}

export function useCreateCourseRule(courseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: CourseRuleType;
      target: string;
      keep: number;
      total: number;
      enabled?: boolean;
    }) =>
      courseRulesRepo.createCourseRule({
        ...input,
        course_id: courseId!,
      }),
    onSuccess: (_, __, ctx) => {
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course_rules', courseId] });
    },
  });
}

export function useUpdateCourseRule(courseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { enabled?: boolean; keep?: number; total?: number; target?: string };
    }) => courseRulesRepo.updateCourseRule(id, patch),
    onSuccess: () => {
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course_rules', courseId] });
    },
  });
}

export function useDeleteCourseRule(courseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => courseRulesRepo.deleteCourseRule(id),
    onSuccess: () => {
      if (courseId) queryClient.invalidateQueries({ queryKey: ['course_rules', courseId] });
    },
  });
}
