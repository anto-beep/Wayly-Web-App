import React, { useMemo } from "react";

const RULES = [
    { id: "len", label: "8+ characters", test: (p) => p.length >= 8 },
    { id: "upper", label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
    { id: "lower", label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
    { id: "num", label: "A number (0–9)", test: (p) => /[0-9]/.test(p) },
    { id: "sym", label: "A symbol (!@#$…)", test: (p) => /[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]/.test(p) },
];

export function evaluatePassword(password, { email = "", name = "" } = {}) {
    const passed = RULES.filter((r) => r.test(password));
    const score = passed.length;
    let label = "Weak";
    if (score >= 5) label = "Strong";
    else if (score >= 4) label = "Good";
    else if (score >= 3) label = "Fair";

    const lower = password.toLowerCase();
    const containsIdentity =
        (email && lower.includes(email.toLowerCase().split("@")[0])) ||
        (name && name.trim().length > 2 && lower.includes(name.toLowerCase().split(" ")[0]));

    const valid = score === RULES.length && !containsIdentity;
    return { score, label, valid, containsIdentity, rules: RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) })) };
}

export default function PasswordStrength({ password, email, name }) {
    const result = useMemo(() => evaluatePassword(password, { email, name }), [password, email, name]);
    const barColors = ["#C5734D", "#D99E42", "#D4A24E", "#7A9B7E"];
    const activeColor = barColors[Math.min(3, Math.max(0, result.score - 2))];
    if (!password) return null;
    return (
        <div className="mt-2" data-testid="password-strength">
            <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-1.5 flex-1 rounded-full transition-colors"
                        style={{ background: i < result.score - 1 ? activeColor : "#E8E2D9" }}
                    />
                ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="font-medium" style={{ color: activeColor }}>{result.label}</span>
                {result.containsIdentity && <span className="text-[#C5734D]">Don't include your name/email</span>}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-y-1 gap-x-3 text-[11px]">
                {result.rules.map((r) => (
                    <li key={r.id} className={`flex items-center gap-1.5 ${r.ok ? "text-[#7A9B7E]" : "text-[#6B7280]"}`}>
                        <span className="inline-block w-3 text-center">{r.ok ? "✓" : "•"}</span>
                        {r.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}
