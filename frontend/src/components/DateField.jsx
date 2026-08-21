import React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

/**
 * Australian date picker: shows the value as DD/MM/YYYY with a calendar
 * popover, but stores/emits ISO (yyyy-MM-dd) so the backend contract is
 * unchanged. onChange receives the ISO string (matches the plain-input
 * `e.target.value` shape used across the app when passed through update()).
 */
export function DateField({ value, onChange, testId, placeholder = "DD/MM/YYYY", maxDate, className = "" }) {
    const [open, setOpen] = React.useState(false);
    const selected = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
    const display = selected && isValid(selected) ? format(selected, "dd/MM/yyyy") : "";
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-testid={testId}
                    className={`mt-1 w-full flex items-center justify-between rounded-md border border-kindred bg-surface px-3 py-2.5 text-left focus:outline-none focus:ring-2 ring-primary-k ${className}`}
                >
                    <span className={display ? "text-primary-k" : "text-muted-k"}>{display || placeholder}</span>
                    <CalendarIcon className="h-4 w-4 text-muted-k" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
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
    );
}

export default DateField;
