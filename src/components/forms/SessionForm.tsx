import { useState, useEffect } from 'react'
import { api, useMutation, useQuery } from '~/lib/api-client'
import { Mail, Send, CheckCircle2, User, Building, AlertCircle, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

interface EmployeePreset {
  id: string
  name: string
  role: string
  department: string
  email: string
}

const PRESET_EMPLOYEES: EmployeePreset[] = [
  {
    id: 'EMP-01',
    name: 'Marcus Vance',
    role: 'Senior Compliance Officer',
    department: 'Risk & Regulatory Compliance',
    email: 'marcus.vance@openkyc.internal',
  },
  {
    id: 'EMP-02',
    name: 'Sarah Lin',
    role: 'Wealth Portfolio Advisor',
    department: 'Private Banking',
    email: 'sarah.lin@openkyc.internal',
  },
  {
    id: 'EMP-03',
    name: 'David Kim',
    role: 'Retail Branch Manager',
    department: 'Commercial Operations',
    email: 'david.kim@openkyc.internal',
  },
  {
    id: 'EMP-04',
    name: 'Alex Chen',
    role: 'Commercial Underwriter',
    department: 'Corporate Lending',
    email: 'alex.chen@openkyc.internal',
  },
  {
    id: 'EMP-05',
    name: 'Grace Miller',
    role: 'Software Engineer (Contractor)',
    department: 'Digital Delivery',
    email: 'grace.miller.freel@vendorcontract.io',
  },
]

export function SessionForm() {
  const workflows = useQuery(api.functions.workflows.getWorkflows, {
    status: 'active',
  })
  const create = useMutation(api.sessions.createSession)
  const sendInvite = useMutation(api.sessions.sendInvitation)

  const [workflowId, setWorkflow] = useState('')
  const [recipientType, setRecipientType] = useState<'customer' | 'employee'>('customer')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [url, setUrl] = useState('')
  const [createdSessionId, setCreatedSessionId] = useState('')
  const [emailDispatched, setEmailDispatched] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resending, setResending] = useState(false)

  // Default to first active workflow if available
  useEffect(() => {
    if (workflows?.length && !workflowId) {
      setWorkflow(workflows[0]._id)
    }
  }, [workflows, workflowId])

  function handleSelectEmployee(empId: string) {
    if (!empId) {
      setUsername('')
      setEmail('')
      setRole('')
      setDepartment('')
      return
    }
    const emp = PRESET_EMPLOYEES.find((e) => e.id === empId)
    if (emp) {
      setUsername(emp.name)
      setEmail(emp.email)
      setRole(emp.role)
      setDepartment(emp.department)
    }
  }

  async function handleManualResend() {
    if (!createdSessionId || !email) return
    setResending(true)
    try {
      const res = await sendInvite({
        sessionId: createdSessionId,
        email,
        recipientName: username,
        recipientType,
        role: role || undefined,
        department: department || undefined,
      })
      if (res?.success) {
        toast.success(`Verification email dispatched to ${email}`)
        setEmailDispatched(true)
      } else {
        toast.error(res?.error || 'Failed to dispatch email')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send invitation email')
    } finally {
      setResending(false)
    }
  }

  function handleCopy() {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Collection link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setEmailDispatched(null)
        try {
          const created = await create({
            workflowId,
            username: username || undefined,
            email: email || undefined,
            recipientType,
            role: role || undefined,
            department: department || undefined,
            sendEmail: sendEmail && Boolean(email),
          })
          const sessionUrl = `${location.origin}/sessions/${created.sessionId}?token=${created.publicToken}`
          setUrl(sessionUrl)
          setCreatedSessionId(created.sessionId)
          setEmailDispatched(Boolean(created.emailSent))

          if (created.emailSent) {
            toast.success(`KYC invitation email sent to ${email} via Resend!`)
          } else if (email && sendEmail) {
            toast.info(`Session created. Check email dispatch status below.`)
          } else {
            toast.success('Verification session created successfully!')
          }
        } catch (err: any) {
          toast.error(err?.message || 'Failed to create verification session')
        } finally {
          setBusy(false)
        }
      }}
    >
      <div>
        <h2 className="text-xl font-bold tracking-tight text-neutral-900">
          Create Verification Session
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Initiate identity compliance and automatically dispatch verification emails via Resend.
        </p>
      </div>

      {/* Recipient Type Tabs */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
          Subject Category
        </label>
        <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl max-w-sm">
          <button
            type="button"
            onClick={() => {
              setRecipientType('customer')
              setUsername('')
              setEmail('')
              setRole('')
              setDepartment('')
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${
              recipientType === 'customer'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <User className="size-4" />
            <span>Customer</span>
          </button>
          <button
            type="button"
            onClick={() => setRecipientType('employee')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${
              recipientType === 'employee'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Building className="size-4" />
            <span>Employee</span>
          </button>
        </div>
      </div>

      {/* Preset Employee Picker */}
      {recipientType === 'employee' && (
        <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl space-y-2">
          <label className="block text-xs font-semibold text-blue-900">
            Select Known Employee Profile (or enter manually)
          </label>
          <select
            className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => handleSelectEmployee(e.target.value)}
          >
            <option value="">-- Choose an employee profile --</option>
            {PRESET_EMPLOYEES.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} — {emp.role} ({emp.department})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Workflow Selection */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-neutral-700">
          Verification Workflow <span className="text-red-500">*</span>
        </label>
        <select
          required
          className="border border-neutral-300 rounded-lg p-2.5 block w-full text-sm bg-white focus:ring-2 focus:ring-primary focus:border-primary"
          value={workflowId}
          onChange={(e) => setWorkflow(e.target.value)}
        >
          <option value="">Select an active workflow</option>
          {workflows?.map((w) => (
            <option key={w._id} value={w._id}>
              {w.name} {w.type ? `(${w.type})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Subject Information */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-700">
            Full Name
          </label>
          <input
            className="border border-neutral-300 rounded-lg p-2.5 block w-full text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder={recipientType === 'employee' ? 'e.g. Marcus Vance' : 'e.g. John Doe'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-700">
            Email Address
          </label>
          <div className="relative">
            <input
              className="border border-neutral-300 rounded-lg p-2.5 pl-9 block w-full text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              type="email"
              placeholder={recipientType === 'employee' ? 'employee@company.com' : 'user@example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Mail className="size-4 text-neutral-400 absolute left-3 top-3" />
          </div>
        </div>
      </div>

      {/* Employee Specific Details */}
      {recipientType === 'employee' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-700">
              Role / Title
            </label>
            <input
              className="border border-neutral-300 rounded-lg p-2.5 block w-full text-sm"
              placeholder="e.g. Senior Compliance Officer"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-700">
              Department
            </label>
            <input
              className="border border-neutral-300 rounded-lg p-2.5 block w-full text-sm"
              placeholder="e.g. Risk & Regulatory"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Resend Email Option */}
      <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 flex items-start gap-3">
        <input
          id="sendEmailCheckbox"
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="mt-1 h-4 w-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500"
        />
        <label htmlFor="sendEmailCheckbox" className="text-sm cursor-pointer select-none">
          <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
            <Send className="size-3.5 text-emerald-600" />
            Send KYC Invitation Email via Resend
          </span>
          <span className="block text-xs text-emerald-700/90 mt-0.5">
            Dispatches a high-priority invitation with private session token and security instructions directly to {email ? <strong>{email}</strong> : 'the recipient email'}.
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="w-full bg-neutral-900 hover:bg-black text-white font-medium rounded-xl py-2.5 px-4 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
        disabled={busy || !workflows?.length}
      >
        {busy ? (
          <>
            <span className="animate-spin size-4 border-2 border-white border-t-transparent rounded-full" />
            <span>Creating Session & Sending Email…</span>
          </>
        ) : (
          <>
            <Send className="size-4" />
            <span>Create Session & Dispatch Invite</span>
          </>
        )}
      </button>

      {workflows?.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-600 shrink-0" />
          <span>Please create an active workflow in Workflow Settings first.</span>
        </div>
      )}

      {/* Results / Link Box */}
      {url && (
        <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Private Collection Link
            </span>
            {emailDispatched === true && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Email sent via Resend
              </span>
            )}
            {emailDispatched === false && email && (
              <button
                type="button"
                onClick={handleManualResend}
                disabled={resending}
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
              >
                <Mail className="size-3" />
                <span>{resending ? 'Sending…' : 'Resend Email'}</span>
              </button>
            )}
          </div>

          <div className="p-2.5 bg-white border rounded-lg font-mono text-xs text-neutral-700 break-all select-all">
            {url}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-200 hover:bg-neutral-300 text-xs font-medium text-neutral-800 transition"
              onClick={handleCopy}
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-black text-xs font-medium text-white transition"
            >
              <span>Open Verification Session &rarr;</span>
            </a>
          </div>
        </div>
      )}
    </form>
  )
}
