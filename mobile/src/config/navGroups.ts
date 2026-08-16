import { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  FilePenLine,
  FileBarChart,
  FileText,
  FolderArchive,
  Heart,
  HeartHandshake,
  HeartPulse,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Phone,
  Repeat,
  ScrollText,
  Share2,
  Sparkles,
  Star,
  Timer,
  UserPlus,
  User as UserIcon,
  Users,
  Wallet,
  Wrench,
  LifeBuoy,
  Settings as SettingsIcon,
  ReceiptText,
} from "lucide-react-native";

export type NavItem = { label: string; route: string; icon: LucideIcon; implemented?: boolean };
export type NavGroup = { key: string; label: string; items: NavItem[] };

// Mirrors the web sidebar groups (components/Layout.jsx navGroups). `implemented`
// marks screens that exist in the mobile app today; the drawer shows only those
// so there are no dead links. More are enabled as each phase lands.
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "today",
    label: "Today",
    items: [
      { label: "Dashboard", route: "/(tabs)", icon: LayoutDashboard, implemented: true },
      { label: "Profile", route: "/participants", icon: UserIcon, implemented: true },
      { label: "Family Wall", route: "/(tabs)/family", icon: Heart, implemented: true },
      { label: "AI Tools", route: "/(tabs)/ai-tools", icon: Sparkles, implemented: true },
    ],
  },
  {
    key: "money",
    label: "Money & Statements",
    items: [
      { label: "Quarterly Pacing", route: "/pacing", icon: Timer, implemented: true },
      { label: "Statements", route: "/(tabs)/statements", icon: FileText, implemented: true },
      { label: "Invoices", route: "/invoices", icon: ReceiptText, implemented: true },
      { label: "Budget Alerts", route: "/budget-alerts", icon: Bell, implemented: true },
      { label: "Budget Scenarios", route: "/budget-scenarios", icon: Wallet, implemented: true },
      { label: "Reports", route: "/reports", icon: FileBarChart, implemented: true },
    ],
  },
  {
    key: "journeys",
    label: "Guided Journeys",
    items: [
      { label: "Ask Wayly", route: "/(tabs)/ask", icon: MessageCircle, implemented: true },
      { label: "Carer Self-Check", route: "/carer-self-check", icon: Heart },
      { label: "Handover Pack", route: "/handover-pack", icon: ClipboardEdit },
      { label: "Classification Prep", route: "/classification-prep", icon: ClipboardList },
      { label: "AT & HM Projects", route: "/athm", icon: Wrench },
      { label: "CHSP Tools", route: "/chsp-tools", icon: HeartPulse },
      { label: "Letters Mailbox", route: "/letters", icon: Mail },
      { label: "Switch Provider", route: "/provider-switch", icon: Repeat },
    ],
  },
  {
    key: "care",
    label: "Their Care",
    items: [
      { label: "Care Team", route: "/care-team", icon: Users },
      { label: "Key Contacts", route: "/key-contacts", icon: Phone },
      { label: "Calendar", route: "/calendar", icon: Calendar },
      { label: "Hospital Mode", route: "/hospital", icon: HeartPulse },
      { label: "Care Plans", route: "/care-plans", icon: ClipboardList },
      { label: "Care-Plan Changes", route: "/amendments", icon: FilePenLine },
      { label: "Log a Scenario", route: "/scenarios", icon: ClipboardEdit },
      { label: "Timeline", route: "/timeline", icon: Activity },
    ],
  },
  {
    key: "paperwork",
    label: "Providers & Paperwork",
    items: [
      { label: "Documents", route: "/documents", icon: FolderArchive },
      { label: "Correspondence", route: "/correspondence", icon: Mail },
      { label: "Compare Providers", route: "/compare-providers", icon: Star },
      { label: "Ratings", route: "/ratings", icon: Star },
    ],
  },
  {
    key: "account",
    label: "Your Account",
    items: [
      { label: "Participants", route: "/participants", icon: UserPlus, implemented: true },
      { label: "Referrals", route: "/referrals", icon: Share2 },
      { label: "Audit Log", route: "/audit", icon: ScrollText },
      { label: "Support", route: "/support", icon: LifeBuoy },
      { label: "Settings", route: "/(tabs)/settings", icon: SettingsIcon, implemented: true },
    ],
  },
];

export const BRAND_ICON = HeartHandshake;
