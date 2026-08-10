import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-none border border-black px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all uppercase tracking-wide font-pixel-body [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_1px_1px_0px_rgba(255,255,255,0.3),inset_-1px_-1px_0px_rgba(0,0,0,0.3)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_1px_1px_0px_rgba(255,255,255,0.1),inset_-1px_-1px_0px_rgba(0,0,0,0.4)]",
        destructive:
          "bg-destructive text-white shadow-[inset_1px_1px_0px_rgba(255,255,255,0.3),inset_-1px_-1px_0px_rgba(0,0,0,0.4)]",
        outline:
          "border-border bg-card text-foreground shadow-[inset_1px_1px_0px_rgba(255,255,255,0.1),inset_-1px_-1px_0px_rgba(0,0,0,0.4)]",
        ghost:
          "border-transparent bg-transparent hover:bg-muted text-muted-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
