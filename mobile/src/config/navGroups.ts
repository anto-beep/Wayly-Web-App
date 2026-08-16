import { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  Compass,
  FilePenLine,
  FileBarChart,
  FileText,
  FolderArchive,
  Heart,
  HeartHandshake,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
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
      { label: "Profile", route: "/profile", icon: UserIcon, implemented: true },
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
      { label: "Contribution Position", route: "/contribution-position", icon: Wallet, implemented: true },
      { label: "Reports", route: "/reports", icon: FileBarChart, implemented: true },
    ],
  },
  {
    key: "journeys",
    label: "Guided Journeys",
    items: [
      { label: "Guided Journeys", route: "/journeys", icon: Compass, implemented: true },
      { label: "Ask Wayly", route: "/(tabs)/ask", icon: MessageCircle, implemented: true },
      { label: "Carer Self-Check", route: "/carer-self-check", icon: Heart, implemented: true },
      { label: "Handover Pack", route: "/handover-pack", icon: ClipboardEdit, implemented: true },
      { label: "Classification Prep", route: "/classification-prep", icon: ClipboardList, implemented: true },
      { label: "AT & HM Projects", route: "/athm", icon: Wrench, implemented: true },
      { label: "CHSP Tools", route: "/chsp-tools", icon: HeartPulse, implemented: true },
      { label: "Letters Mailbox", route: "/letters", icon: Mail, implemented: true },
      { label: "Switch Provider", route: "/provider-switch", icon: Repeat, implemented: true },
    ],
  },
  {
    key: "care",
    label: "Their Care",
    items: [
      { label: "Care Team", route: "/care-team", icon: Users, implemented: true },
      { label: "Key Contacts", route: "/key-contacts", icon: Phone, implemented: true },
      { label: "Calendar", route: "/calendar", icon: Calendar, implemented: true },
      { label: "Hospital Mode", route: "/hospital", icon: HeartPulse, implemented: true },
      { label: "Care Plans", route: "/care-plans", icon: ClipboardList, implemented: true },
      { label: "Care-Plan Changes", route: "/amendments", icon: FilePenLine, implemented: true },
      { label: "Log a Scenario", route: "/scenarios", icon: ClipboardEdit, implemented: true },
      { label: "Cases", route: "/cases", icon: ListChecks, implemented: true },
      { label: "Timeline", route: "/timeline", icon: Activity, implemented: true },
    ],
  },
  {
    key: "paperwork",
    label: "Providers & Paperwork",
    items: [
      { label: "Documents", route: "/documents", icon: FolderArchive, implemented: true },
      { label: "Correspondence", route: "/correspondence", icon: Mail, implemented: true },
      { label: "Compare Providers", route: "/compare-providers", icon: Star, implemented: true },
      { label: "Ratings", route: "/ratings", icon: Star, implemented: true },
    ],
  },
  {
    key: "account",
    label: "Your Account",
    items: [
      { label: "Participants", route: "/participants", icon: UserPlus, implemented: true },
      { label: "Referrals", route: "/referrals", icon: Share2, implemented: true },
      { label: "Audit Log", route: "/audit", icon: ScrollText, implemented: true },
      { label: "Support", route: "/support", icon: LifeBuoy, implemented: true },
      { label: "Settings", route: "/(tabs)/settings", icon: SettingsIcon, implemented: true },
    ],
  },
];

export const BRAND_ICON = HeartHandshake;
