import { useCallback, useEffect } from 'react'
import {
  queryOptions,
  useQuery as useTanstackQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Ref } from '@open-kyc/contracts'
export { api } from '@open-kyc/contracts'
export async function request<A, R>(ref: Ref<A, R>, args: A): Promise<R> {
  const token = new URLSearchParams(window.location.search).get('token')
  const response = await fetch(`/api/rpc/${ref.name}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Session-Token': token } : {}),
    },
    body: JSON.stringify(args || {}),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Request failed')
  return result
}
export function apiQuery<A, R>(ref: Ref<A, R>, args: A) {
  return queryOptions({
    queryKey: ['api', ref.name, args],
    queryFn: () => request(ref, args),
    staleTime: 1000,
    refetchInterval: 15000,
  })
}
export function useQuery<A, R>(
  ref: Ref<A, R>,
  args?: A | 'skip',
): R | undefined {
  const result = useTanstackQuery({
    ...apiQuery(ref, (args || {}) as A),
    enabled: args !== 'skip',
  })
  if (result.error) throw result.error
  return result.data
}
export function useMutation<A, R>(ref: Ref<A, R>) {
  const client = useQueryClient()
  return useCallback(
    async (args?: A) => {
      try {
        const result = await request(ref, (args || {}) as A)
        await client.invalidateQueries({ queryKey: ['api'] })
        return result
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Request failed')
        throw error
      }
    },
    [client, ref],
  )
}
export const useApiMutation = useMutation
export const useAction = useMutation
export function LiveUpdates() {
  const client = useQueryClient()
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.onmessage = () => {
      void client.invalidateQueries({ queryKey: ['api'] })
    }
    return () => source.close()
  }, [client])
  return null
}
