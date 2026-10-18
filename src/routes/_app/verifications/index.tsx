import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { EllipsisVerticalIcon } from "@heroicons/react/24/outline"
import { use, useMemo } from "react"
import { Autocomplete, AutocompleteStateContext, useFilter } from "react-aria-components"
import { api } from '@open-kyc/contracts'
import { apiQuery, useApiMutation } from '~/lib/api-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { Doc } from '@open-kyc/contracts'


import { Button } from '~/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "~/components/ui/menu"
import { SearchField, SearchInput } from "~/components/ui/search-field"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { Modal, ModalContent, ModalTrigger } from '~/components/ui/modal'
import { SessionForm } from '~/components/forms/SessionForm'


import { QrCode, Copy, Eye, ExternalLink } from 'lucide-react'
import QRCode from 'react-qr-code'

function StatusBadge({ status }: { status?: string }) {
  const s = status || 'initiated'
  const styles: Record<string, { bg: string; dot: string; label: string }> = {
    completed: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Submitted' },
    approved: { bg: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500', label: 'Approved' },
    in_progress: { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500 animate-pulse', label: 'In Progress' },
    initiated: { bg: 'bg-neutral-100 text-neutral-700 border-neutral-200', dot: 'bg-neutral-400', label: 'Initiated' },
    rejected: { bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', label: 'Rejected' },
    failed: { bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Failed' },
    expired: { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Expired' },
  }
  const current = styles[s] || { bg: 'bg-neutral-100 text-neutral-700 border-neutral-200', dot: 'bg-neutral-400', label: s }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${current.bg}`}>
      <span className={`size-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  )
}

export function VerificationTable({ sessions }: { sessions: Array<Doc<'sessions'>> }) {
  const { contains } = useFilter({
    sensitivity: "base",
  })

  const navigate = useNavigate();
  const deleteSession = useApiMutation(api.sessions.deleteSession);

  // Quick summary counts
  const total = sessions.length
  const completed = sessions.filter((s) => s.status === 'completed').length
  const approved = sessions.filter((s) => s.reviewStatus === 'approved').length
  const inProgress = sessions.filter((s) => s.status === 'in_progress').length

  return (
    <div className="space-y-4">
      {/* Quick stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border/60 rounded-xl p-4 bg-card/60 shadow-2xs">
          <p className="text-xs font-medium text-muted-fg uppercase tracking-wider">Total Sessions</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-fg">{total}</p>
        </div>
        <div className="border border-border/60 rounded-xl p-4 bg-card/60 shadow-2xs">
          <p className="text-xs font-medium text-muted-fg uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-fg">{inProgress}</p>
        </div>
        <div className="border border-border/60 rounded-xl p-4 bg-card/60 shadow-2xs">
          <p className="text-xs font-medium text-muted-fg uppercase tracking-wider">Needs Review</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-indigo-600 dark:text-indigo-400">{completed}</p>
        </div>
        <div className="border border-border/60 rounded-xl p-4 bg-card/60 shadow-2xs">
          <p className="text-xs font-medium text-muted-fg uppercase tracking-wider">Approved</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600 dark:text-emerald-400">{approved}</p>
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-card shadow-sm">
        <Autocomplete filter={contains}>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <CardHeader className="p-0">
              <CardTitle>Verification Sessions</CardTitle>
              <CardDescription>
                Live verification sessions with real-time status updates and mobile QR links
              </CardDescription>
            </CardHeader>
            <div className="flex justify-end">
              <SearchField aria-label="Search">
                <SearchInput placeholder="Search sessions..." />
              </SearchField>
            </div>
          </div>
          <Table className="mt-4" aria-label="Sessions">
            <TableHeader>
              <TableColumn className="w-0">Session Link & QR</TableColumn>
              <TableColumn isRowHeader>Username</TableColumn>
              <TableColumn>Email</TableColumn>
              <TableColumn>Step</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Joined</TableColumn>
              <TableColumn className="text-right">Actions</TableColumn>
            </TableHeader>
            <TableBody items={sessions}>
              {(item: Doc<'sessions'>) => {
                const sessionUrl = typeof window !== 'undefined'
                  ? `${window.location.origin}/sessions/${item._id}?token=${item.publicToken}`
                  : `/sessions/${item._id}`

                return (
                  <TableRow id={item._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                          onClick={() => {
                            navigator.clipboard.writeText(sessionUrl)
                              .then(() => toast.success("Session link copied to clipboard!"))
                              .catch(() => toast.error("Failed to copy"));
                          }}
                          title="Click to copy session URL"
                        >
                          <span className="max-w-[100px] truncate">{item._id}</span>
                          <Copy className="size-3 opacity-60 group-hover:opacity-100" />
                        </button>

                        {/* QR Code preview modal */}
                        <Modal>
                          <ModalTrigger>
                            <Button
                              size="xs"
                              intent="outline"
                              className="size-6 p-0 inline-flex items-center justify-center rounded"
                              aria-label="Scan QR Code"
                            >
                              <QrCode className="size-3.5" />
                            </Button>
                          </ModalTrigger>
                          <ModalContent className="p-6 text-center space-y-4 max-w-sm">
                            <div>
                              <h3 className="text-lg font-semibold">Mobile Session QR</h3>
                              <p className="text-xs text-muted-fg mt-1">
                                Scan with your phone's camera to test this session live
                              </p>
                            </div>
                            <div className="flex justify-center p-4 bg-white rounded-xl border">
                              <QRCode value={sessionUrl} size={180} />
                            </div>
                            <p className="font-mono text-[11px] text-neutral-500 break-all bg-neutral-100 p-2 rounded">
                              {sessionUrl}
                            </p>
                            <Button
                              intent="secondary"
                              className="w-full"
                              onClick={() => {
                                navigator.clipboard.writeText(sessionUrl)
                                  .then(() => toast.success("Copied to clipboard!"))
                              }}
                            >
                              <Copy className="size-4 mr-2" />
                              Copy Link
                            </Button>
                          </ModalContent>
                        </Modal>
                      </div>
                    </TableCell>
                    <TableCell textValue={item.username}>
                      <AutocompleteHighlight>{item.username || '-'}</AutocompleteHighlight>
                    </TableCell>
                    <TableCell textValue={item.email}>
                      <AutocompleteHighlight>{item.email || '-'}</AutocompleteHighlight>
                    </TableCell>
                    <TableCell textValue={item.step}>
                      <span className="capitalize font-mono text-xs px-2 py-0.5 bg-neutral-100 rounded">
                        <AutocompleteHighlight>{item.step || 'start'}</AutocompleteHighlight>
                      </span>
                    </TableCell>
                    <TableCell textValue={item.status}>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-xs text-neutral-600">
                      {(new Date(item.createdAt)).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="xs"
                          intent="secondary"
                          className="h-7 px-2 text-xs flex items-center gap-1"
                          onClick={() => {
                            navigate({
                              to: "/verifications/$id",
                              params: { id: item._id }
                            })
                          }}
                        >
                          <Eye className="size-3.5" />
                          <span>View</span>
                        </Button>
                        <Menu>
                          <MenuTrigger className="size-7 flex items-center justify-center rounded hover:bg-neutral-100">
                            <EllipsisVerticalIcon className="size-4" />
                          </MenuTrigger>
                          <MenuContent aria-label="Actions" placement="left top">
                            <MenuItem onClick={() => {
                              navigate({
                                to: "/verifications/$id",
                                params: { id: item._id }
                              })
                            }}>
                              <Eye className="size-4 mr-2" />
                              View Details
                            </MenuItem>
                            <MenuItem onClick={() => {
                              window.open(sessionUrl, '_blank')
                            }}>
                              <ExternalLink className="size-4 mr-2" />
                              Open Live Session
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              onClick={() => {
                                deleteSession({ sessionId: item._id })
                              }}
                              intent="danger"
                            >
                              Delete
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              }}
            </TableBody>
          </Table>
        </Autocomplete>
      </div>
    </div>
  )
}



function AutocompleteHighlight({ children }: { children: string }) {
  const state = use(AutocompleteStateContext)!
  const index = useMemo(() => {
    // TODO: use a better case-insensitive matching algorithm
    return children.toLowerCase().indexOf(state.inputValue.toLowerCase())
  }, [children, state.inputValue])

  if (index >= 0) {
    return (
      <>
        {children.slice(0, index)}
        <mark className="bg-primary text-primary-fg">
          {children.slice(index, index + state.inputValue.length)}
        </mark>
        {children.slice(index + state.inputValue.length)}
      </>
    )
  }

  return children
}



export const Route = createFileRoute('/_app/verifications/')({
  component: RouteComponent,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(apiQuery(api.sessions.getSessions, {}))
  },
  pendingComponent: () => (<div>Loading...</div>),

})




function RouteComponent() {
  const { data } = useSuspenseQuery(apiQuery(api.sessions.getSessions, {}));
  return <div>
    <div className="flex justify-between  items-center pb-4 px-2">
      <div className="text-xl font-semibold">
        Verification
      </div>
      <Modal>
        <ModalTrigger>
          <Button intent="primary"> + Session</Button>
        </ModalTrigger>

        <ModalContent className="p-6" size="4xl">

          <SessionForm />

        </ModalContent>

      </Modal>
    </div>


    <VerificationTable sessions={data} />
  </div>
}
