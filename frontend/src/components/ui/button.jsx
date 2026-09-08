import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-[0_6px_20px_-8px_rgba(14,77,82,0.55)] hover:shadow-[0_12px_30px_-10px_rgba(14,77,82,0.65)] hover:-translate-y-0.5 hover:brightness-110",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground shadow-[0_6px_20px_-8px_rgba(155,34,38,0.5)] hover:shadow-[0_12px_30px_-10px_rgba(155,34,38,0.6)] hover:-translate-y-0.5 hover:brightness-110",
        outline:
          "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 hover:shadow-md",
        secondary:
          "bg-gradient-to-b from-secondary to-secondary/90 text-secondary-foreground shadow-[0_6px_20px_-8px_rgba(165,81,43,0.5)] hover:shadow-[0_12px_30px_-10px_rgba(165,81,43,0.6)] hover:-translate-y-0.5 hover:brightness-110",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // UI-2 Phase 5 (9.9 = extend existing), shared "Report An Issue"
        // affordance wired into the SUP-0..SUP-3 support-defect model.
        // Label copy is always Title Case per Rule 2.4.
        "report-issue":
          "bg-surface border border-kindred text-primary-k text-xs font-medium px-3 py-1.5 rounded-full hover:border-primary-k hover:bg-surface-2 h-auto shadow-none",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
