import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none text-sm font-semibold whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "pixel-raised pixel-press bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "pixel-raised pixel-press bg-secondary text-secondary-foreground hover:bg-muted",
        secondary:
          "pixel-raised pixel-press bg-accent text-accent-foreground hover:bg-accent/80",
        ghost:
          "border border-transparent bg-transparent text-foreground hover:bg-muted",
        destructive:
          "pixel-raised pixel-press bg-destructive text-white hover:bg-destructive/90",
        link: "border border-transparent text-primary underline-offset-4 hover:underline",
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
  },
);

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
  );
}

export { Button, buttonVariants };
