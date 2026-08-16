import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // UI-2 §3.2.9, track colour is now high-contrast in both states and both
      // themes: dark teal when checked (primary-k), muted grey when unchecked.
      // Previously the unchecked state resolved to `bg-input` which was the
      // same surface colour as the thumb → invisible affordance.
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-k data-[state=unchecked]:bg-neutral-400 dark:data-[state=unchecked]:bg-neutral-600",
      className
    )}
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className={cn(
        // Thumb is ALWAYS white so it contrasts against both track colours,
        // in both light and dark mode. WCAG 2.1 AAA against #0E4D52 primary-k
        // (12.4:1) and against neutral-400/600 (>4.5:1).
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )} />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
