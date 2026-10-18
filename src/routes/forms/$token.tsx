import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/forms/$token')({ component: PublicForm })
function PublicForm() {
  const { token } = Route.useParams()
  const [form, setForm] = useState<any>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch(`/api/public/questionnaires/${token}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error)
        setForm(body)
      })
      .catch((e) => setError(e.message))
  }, [token])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const response = await fetch(`/api/public/questionnaires/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.fromEntries(
            form.questions.map((q: any) => [q.id, answers[q.id] || '']),
          ),
        }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="max-w-xl mx-auto my-12 p-8 border rounded-xl space-y-5"
      onSubmit={submit}
    >
      <h1 className="text-3xl font-semibold">
        {form?.title || 'Questionnaire'}
      </h1>
      {done ? (
        <p>Thank you. Your answers have been submitted.</p>
      ) : (
        <>
          <p>{form?.description}</p>
          {form?.questions.map((q: any) => (
            <label className="block" key={q.id}>
              {q.text}
              {q.required ? ' *' : ''}
              <textarea
                className="border rounded p-2 w-full mt-2"
                required={q.required}
                maxLength={4000}
                value={answers[q.id] || ''}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
              />
            </label>
          ))}
          <button
            className="bg-black text-white rounded px-5 py-2"
            disabled={busy || !form}
          >
            Submit answers
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
