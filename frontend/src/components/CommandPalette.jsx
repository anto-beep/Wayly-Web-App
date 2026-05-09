import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    LayoutDashboard, FileText, MessageCircle, Users, ScrollText, Bell, CreditCard, Sparkles,
    Settings as SettingsIcon, Search, Mailbox, User, BookOpen, Phone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
    CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";

/**
 * Global ⌘K / Ctrl+K command palette. Mounted once at app root.
 */
export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const nav = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
        const onKey = (e) => {
            if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    const go = (path) => { nav(path); setOpen(false); };

    const appItems = [
        { label: "Dashboard", to: "/app", icon: LayoutDashboard, shortcut: "G D" },
        { label: "Statements", to: "/app/statements", icon: FileText, shortcut: "G S" },
        { label: "Upload statement", to: "/app/statements/upload", icon: FileText },
        { label: "Ask Wayly", to: "/app/chat", icon: MessageCircle, shortcut: "G C" },
        { label: "Family thread", to: "/app/family", icon: Users },
        { label: "Audit log", to: "/app/audit", icon: ScrollText },
    ];
    const settingsItems = [
        { label: "Profile", to: "/settings/profile", icon: User },
        { label: "Plan & billing", to: "/settings/billing", icon: CreditCard },
        { label: "Family members", to: "/settings/members", icon: Users },
        { label: "Weekly digest", to: "/settings/digest", icon: Mailbox },
        { label: "Notifications", to: "/settings/notifications", icon: Bell },
        { label: "Appearance", to: "/settings/appearance", icon: SettingsIcon },
    ];
    const toolItems = [
        { label: "Statement Decoder", to: "/ai-tools/statement-decoder", icon: Sparkles },
        { label: "Budget Calculator", to: "/ai-tools/budget-calculator", icon: Sparkles },
        { label: "Provider Price Checker", to: "/ai-tools/provider-price-checker", icon: Sparkles },
        { label: "Classification Self-check", to: "/ai-tools/classification-self-check", icon: Sparkles },
        { label: "Reassessment Letter", to: "/ai-tools/reassessment-letter", icon: Sparkles },
        { label: "Contribution Estimator", to: "/ai-tools/contribution-estimator", icon: Sparkles },
        { label: "Care Plan Reviewer", to: "/ai-tools/care-plan-reviewer", icon: Sparkles },
        { label: "Family Care Coordinator", to: "/ai-tools/family-coordinator", icon: Sparkles },
    ];
    const resourcesItems = [
        { label: "Resources", to: "/resources", icon: BookOpen },
        { label: "Glossary", to: "/resources/glossary", icon: BookOpen },
        { label: "Templates", to: "/resources/templates", icon: BookOpen },
        { label: "Articles", to: "/resources/articles", icon: BookOpen },
        { label: "Pricing", to: "/pricing", icon: CreditCard },
        { label: "Contact / book a demo", to: "/contact", icon: Phone },
    ];

    return (
        <CommandDialog open={open} onOpenChange={setOpen} data-testid="command-palette">
            <CommandInput placeholder="Search Wayly…" data-testid="command-input" />
            <CommandList>
                <CommandEmpty>Nothing matches that.</CommandEmpty>
                {user && (
                    <>
                        <CommandGroup heading="App">
                            {appItems.map((i) => (
                                <CommandItem key={i.to} onSelect={() => go(i.to)} value={i.label} data-testid={`cmd-app-${i.label.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <i.icon className="mr-2 h-4 w-4" /> {i.label}
                                    {i.shortcut && <span className="ml-auto text-[10px] tracking-widest text-muted-k">{i.shortcut}</span>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup heading="Settings">
                            {settingsItems.map((i) => (
                                <CommandItem key={i.to} onSelect={() => go(i.to)} value={i.label}>
                                    <i.icon className="mr-2 h-4 w-4" /> {i.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                    </>
                )}
                <CommandGroup heading="AI tools">
                    {toolItems.map((i) => (
                        <CommandItem key={i.to} onSelect={() => go(i.to)} value={i.label}>
                            <i.icon className="mr-2 h-4 w-4" /> {i.label}
                        </CommandItem>
                    ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Resources & marketing">
                    {resourcesItems.map((i) => (
                        <CommandItem key={i.to} onSelect={() => go(i.to)} value={i.label}>
                            <i.icon className="mr-2 h-4 w-4" /> {i.label}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
