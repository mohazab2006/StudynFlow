import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as courseProfilesRepo from '../db/courseProfiles.repo';
import type { CourseProfile } from '../lib/types';

export function useCourseProfile(courseId: string | null) {
  return useQuery({
    queryKey: ['course_profile', courseId],
    queryFn: () => courseProfilesRepo.getCourseProfile(courseId!),
    enabled: !!courseId,
  });
}

export function useUpsertCourseProfile(courseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CourseProfile> & { course_id: string }) =>
      courseProfilesRepo.upsertCourseProfile(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['course_profile', data.course_id] });
    },
  });
}
