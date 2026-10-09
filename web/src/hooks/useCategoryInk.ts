import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listCategories } from '../api/categories'
import { queryKeys } from '../api/queryKeys'
import { categoryInks } from '../lib/category'

/** The ink of each category, from the full category list (shared with the filters' cache). */
export function useCategoryInk(): (categoryId: string | null) => string {
  const query = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: ({ signal }) => listCategories(signal),
  })
  return useMemo(() => categoryInks((query.data ?? []).map((category) => category.id)), [query.data])
}
