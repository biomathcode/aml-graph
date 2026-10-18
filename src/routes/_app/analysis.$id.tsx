import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery } from '~/lib/api-client'
export const Route = createFileRoute('/_app/analysis/$id')({
  component: Analysis,
})
function Analysis() {
  const { id } = Route.useParams()
  const result = useQuery(api.helpers.getScrapeResultById, { id })
  return (
    <section className="space-y-4">
      <h1 className="text-3xl">Archived analysis</h1>
      <p>
        Automated analysis is deferred in this release. Historical analysis
        records remain available.
      </p>
      <pre className="whitespace-pre-wrap border rounded p-4">
        {JSON.stringify(result, null, 2)}
      </pre>
    </section>
  )
}
