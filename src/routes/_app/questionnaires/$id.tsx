import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
export const Route = createFileRoute('/_app/questionnaires/$id')({
  component: Editor,
})
function Editor() {
  const { id } = Route.useParams(),
    q = useQuery(api.questionnaires.get, { id }),
    questions = useQuery(api.questions.listByQuestionnaire, {
      questionnaireId: id,
    })
  const save = useMutation(api.questionnaires.update),
    add = useMutation(api.questions.add),
    remove = useMutation(api.questions.remove),
    edit = useMutation(api.questions.update)
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [text, setText] = useState(''),
    [required, setRequired] = useState(false)
  useEffect(() => {
    if (q) {
      setTitle(q.title)
      setDescription(q.description || '')
    }
  }, [q?.title, q?.description])
  if (!q) return <p>Loading…</p>
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Edit questionnaire</h1>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          await save({ id, title, description })
        }}
      >
        <label className="block">
          Title
          <input
            className="border rounded p-2 w-full"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          Description
          <textarea
            className="border rounded p-2 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button className="border rounded px-4 py-2">Save details</button>
      </form>
      <div className="flex gap-4">
        <button
          className="border rounded px-4 py-2"
          onClick={() =>
            void save({ id, title, description, isPublished: !q.isPublished })
          }
        >
          {q.isPublished ? 'Unpublish' : 'Publish'}
        </button>
        {q.isPublished && (
          <a
            className="underline break-all"
            href={`/forms/${q.publicToken}`}
            target="_blank"
            rel="noreferrer"
          >
            Open public form
          </a>
        )}
      </div>
      <h2 className="text-xl font-semibold">Questions</h2>
      {questions?.map((question) => (
        <div
          className="border rounded p-4 space-y-3"
          key={`${question.id}:${question.text}`}
        >
          <input
            aria-label="Question text"
            className="border rounded p-2 w-full"
            defaultValue={question.text}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== question.text)
                void edit({
                  id: question.id,
                  text: e.target.value,
                  required: question.required,
                })
            }}
          />
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) =>
                void edit({
                  id: question.id,
                  text: question.text,
                  required: e.target.checked,
                })
              }
            />
            Required
          </label>
          <button onClick={() => void remove({ id: question.id })}>
            Delete question
          </button>
        </div>
      ))}
      <form
        className="flex flex-wrap gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          await add({
            questionnaireId: id,
            text,
            required,
            order: Math.max(-1, ...(questions || []).map((q) => q.order)) + 1,
          })
          setText('')
        }}
      >
        <input
          aria-label="New question"
          className="border rounded p-2 flex-1"
          required
          placeholder="New question"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>
        <button className="border px-4 rounded">Add question</button>
      </form>
      <Responses id={id} />
    </section>
  )
}
function Responses({ id }: { id: string }) {
  const data = useQuery(api.questionnaires.responses, { id })
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Responses</h2>
      {data?.map((r) => (
        <article key={r._id} className="border p-4 rounded">
          <p>{new Date(r.createdAt).toLocaleString()}</p>
          {Object.entries(r.answers).map(([key, value]) => (
            <p key={key}>
              {r.questions[key] || key}: {String(value)}
            </p>
          ))}
        </article>
      ))}
      {data?.length === 0 && <p>No responses yet.</p>}
    </div>
  )
}
