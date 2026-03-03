import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as courseAssetsRepo from '../db/courseAssets.repo';

export function useCourseAssets(courseId: string | null) {
  return useQuery({
    queryKey: ['courseAssets', courseId],
    queryFn: () => courseAssetsRepo.getAssetsByCourseId(courseId),
  });
}

export function useDeleteCourseAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => courseAssetsRepo.deleteCourseAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courseAssets'] });
    },
  });
}
