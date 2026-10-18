
import { Outlet, createFileRoute, redirect, } from '@tanstack/react-router'

import { LiveUpdates } from '~/lib/api-client'
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import AppSidebar from "~/components/app-sidebar"
import AppSidebarNav from "~/components/app-sidebar-nav"

export const Route = createFileRoute('/_app')({
  beforeLoad: ({context}) => { if (!context.userId) throw redirect({to:'/sign-in'}) },
  component: RouteComponent,
})

function RouteComponent() {
  return <SidebarProvider>
    <LiveUpdates />
    <AppSidebar collapsible="dock" />
    <SidebarInset>
      <AppSidebarNav />
      <div className="p-4 lg:p-6">
        <Outlet />
      </div>
    </SidebarInset>
  </SidebarProvider>
}