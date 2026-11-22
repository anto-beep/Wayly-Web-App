import React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

/**
 * Australian date field: type the value as DD/MM/YYYY (auto-masked as you type,
 * for keyboards without a native date picker) OR pick it from the calendar
 * popover. Either way it stores/emits ISO (yyyy-MM-dd) so the backend contract
 * is unchanged. onChange receives the ISO string.
 */
export function DateField({ value, onChange, testId, placeholder = "DD/MM/YYYY", maxDate, className = "" }) {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState("");
    const focusedRef = React.useRef(false);
    const selected = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
    const display = selected && isValid(selected) ? format(selected, "dd/MM/yyyy") : "";
    // Don't clobber what the user is actively typing; only sync from the ISO value when unfocused.
    React.useEffect(() => { if (!focusedRef.current) setText(display); }, [display]);

    const onType = (raw) => {
        const digits = raw.replace(/\D/g, "").slice(0, 8);
        let masked = digits;
        if (digits.length > 4) masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        else if (digits.length > 2) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        setText(masked);
        const m = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
            const [, dd, mm, yyyy] = m;
            const dt = parse(`${yyyy}-${mm}-${dd}`, "yyyy-MM-dd", new Date());
            const valid = isValid(dt) && dt.getDate() === Number(dd) && dt.getMonth() === Number(mm) - 1 && (!maxDate || dt <= maxDate);
            onChange(valid ? `${yyyy}-${mm}-${dd}` : "");
        } else if (value) {
            onChange("");
        }
    };

    return (
        <div className={`mt-1 relative ${className}`}>
            <input
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                data-testid={testId}
                value={text}
                onFocus={() => { focusedRef.current = true; }}
                onBlur={() => { focusedRef.current = false; setText(display); }}
                onChange={(e) => onType(e.target.value)}
                placeholder={placeholder}
                maxLength={10}
                className="w-full rounded-md border border-kindred bg-surface px-3 py-2.5 pr-10 text-primary-k placeholder:text-muted-k focus:outline-none focus:ring-2 ring-primary-k"
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label="Open calendar"
                        data-testid={testId ? `${testId}-calendar` : undefined}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-k hover:text-primary-k focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k rounded-r-md"
                    >
                        <CalendarIcon className="h-4 w-4" />
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected || new Date(1950, 0, 1)}
                        captionLayout="dropdown-buttons"
                        fromYear={1915}
                        toYear={new Date().getFullYear()}
                        disabled={maxDate ? { after: maxDate } : undefined}
                        onSelect={(d) => {
                            if (d) {
                                onChange(format(d, "yyyy-MM-dd"));
                                setOpen(false);
                            }
                        }}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

export default DateField;
