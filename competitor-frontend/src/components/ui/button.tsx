import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border-2 text-sm font-medium whitespace-nowrap transition-all outline-none select-none active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 font-pixel-body uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-black bg-primary text-primary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.4),inset_-2px_-2px_0px_rgba(0,0,0,0.4),0px_3px_0px_#000000] hover:bg-primary/90 active:shadow-[inset_-2px_-2px_0px_rgba(255,255,255,0.4),inset_2px_2px_0px_rgba(0,0,0,0.4),0px_1px_0px_#000000]",
        outline:
          "border-black bg-secondary text-secondary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.15),inset_-2px_-2px_0px_rgba(0,0,0,0.5),0px_3px_0px_#000000] hover:bg-muted active:shadow-[inset_-2px_-2px_0px_rgba(255,255,255,0.15),inset_2px_2px_0px_rgba(0,0,0,0.5),0px_1px_0px_#000000]",
        secondary:
          "border-black bg-accent text-accent-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.2),inset_-2px_-2px_0px_rgba(0,0,0,0.4),0px_3px_0px_#000000] hover:bg-accent/80 active:shadow-[inset_-2px_-2px_0px_rgba(255,255,255,0.2),inset_2px_2px_0px_rgba(0,0,0,0.4),0px_1px_0px_#000000]",
        ghost:
          "border-transparent bg-transparent text-foreground hover:border-black hover:bg-muted hover:shadow-[inset_1px_1px_0px_rgba(255,255,255,0.1),0px_2px_0px_#000000]",
        destructive:
          "border-black bg-destructive text-white shadow-[inset_2px_2px_0px_rgba(255,255,255,0.3),inset_-2px_-2px_0px_rgba(0,0,0,0.5),0px_3px_0px_#000000] hover:bg-destructive/90 active:shadow-[inset_-2px_-2px_0px_rgba(255,255,255,0.3),inset_2px_2px_0px_rgba(0,0,0,0.5),0px_1px_0px_#000000]",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-3.5 py-1 text-xs",
        xs: "h-6 gap-1 px-2 text-[10px]",
        sm: "h-7 gap-1.5 px-2.5 text-xs",
        lg: "h-11 gap-2.5 px-5 text-sm font-bold",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
