"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SimpleSelectOption = { value: string; label: string; disabled?: boolean };

/**
 * A single-value select driven by a plain option list, for the filter bars and
 * small forms that would otherwise hand-roll a native `<select>`.
 */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  size = "default",
  className,
  "aria-label": ariaLabel,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(String(next ?? ""))}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
