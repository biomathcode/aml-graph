import {
    Home as LucideHome,
    Workflow as WorkflowIcon,
    SwatchBook as SwatchBookIcon,
    IdCard as IdCardIcon,
    ChartPie as ChartPieIcon,
    ShieldAlert,
    ListTodo as ListTodoIcon,
    BookOpen as BookOpenIcon,
    ScanFace as ScanFaceIcon,
    Receipt as ReceiptIcon,
    Settings2 as Settings2Icon,
    Ban as BanIcon,
    Bot as BotIcon,
} from 'lucide-react'

export type AllowedRoutes =
    | "/agent"
    | "/analytics"
    | "/blocklist"
    | "/customization"
    | "/dashboard"
    | "/questionnaires"
    | "/settings"
    | "/verifications"
    | "/workflow"
    | "/documents"
    | "/backgroundcheck"
    | "/billing"
    | "/backgroundsearch"
    | "/aml"

export interface NavItemType {
    href: AllowedRoutes
    icon: React.ElementType
    description: string
    label: string
}

export const NavItem: Array<NavItemType> = [
    {
        href: "/dashboard",
        icon: LucideHome,
        description: "Overview of your entire workspace and stats",
        label: "Dashboard",
    },
    {
        href: "/agent",
        icon: BotIcon,
        description: "Agentic AI compliance & employee/customer graph analysis",
        label: "Agentic Chat",
    },
    {
        href: "/workflow",
        icon: WorkflowIcon,
        description: "Manage and automate your organization’s workflows",
        label: "Workflow",
    },
    {
        href: "/customization",
        icon: SwatchBookIcon,
        description: "Configure branding, themes, and user preferences",
        label: "Customization",
    },
    {
        href: "/verifications",
        icon: IdCardIcon,
        description: "View and manage verification requests and statuses",
        label: "Verifications",
    },
    {
        href: "/analytics",
        icon: ChartPieIcon,
        description: "Visualize and analyze key performance metrics",
        label: "Analytics",
    },
    {
        href: "/aml",
        icon: ShieldAlert,
        description: "Search Business Details & AML Detection",
        label: "AML",
    },
    {
        href: "/questionnaires",
        icon: ListTodoIcon,
        description: "Create and manage user questionnaires and surveys",
        label: "Questionnaries",
    },
    {
        href: "/documents",
        icon: BookOpenIcon,
        description: "Search and File Uploaded Documents",
        label: "Documents",
    },
    {
        href: "/backgroundsearch",
        icon: ScanFaceIcon,
        description: "Perform background checks on users",
        label: "Background Search",
    },
    {
        href: "/billing",
        icon: ReceiptIcon,
        description: "Manage your billing and subscription",
        label: "Billing",
    },
    {
        href: "/settings",
        icon: Settings2Icon,
        description: "Adjust account and application configuration",
        label: "Settings",
    },
    {
        href: "/blocklist",
        icon: BanIcon,
        description: "Monitor and update restricted entities or users",
        label: "Blocklist",
    },
]
