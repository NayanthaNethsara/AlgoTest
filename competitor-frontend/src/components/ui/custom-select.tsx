"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly CustomSelectOption[];
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  align?: "left" | "right";
  "aria-label"?: string;
}

export function CustomSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  icon,
  className,
  triggerClassName,
  contentClassName,
  size = "default",
  disabled = false,
  align = "left",
  "aria-label": ariaLabel,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");

  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((option) => option.value === value);

  const calculateDropdownDirection = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownEstimatedHeight = Math.min(options.length * 36 + 12, 280);
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (spaceBelow < dropdownEstimatedHeight && spaceAbove > spaceBelow) {
      setOpenDirection("up");
    } else {
      setOpenDirection("down");
    }
  }, [options.length]);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    if (!isOpen) {
      calculateDropdownDirection();
      const selectedIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
    setIsOpen((prev) => !prev);
  }, [disabled, isOpen, calculateDropdownDirection, options, value]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const selectOption = useCallback(
    (option: CustomSelectOption) => {
      if (option.disabled) return;
      onValueChange(option.value);
      closeDropdown();
      triggerRef.current?.focus();
    },
    [onValueChange, closeDropdown],
  );

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    }

    function handleScrollOrResize() {
      calculateDropdownDirection();
    }

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, closeDropdown, calculateDropdownDirection]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[
        highlightedIndex
      ] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, highlightedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          const targetOption = options[highlightedIndex];
          if (targetOption && !targetOption.disabled) {
            selectOption(targetOption);
          }
        } else {
          toggleDropdown();
        }
        break;

      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) {
          toggleDropdown();
        } else {
          setHighlightedIndex((prev) => {
            const nextIndex = prev + 1;
            return nextIndex >= options.length ? 0 : nextIndex;
          });
        }
        break;

      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) {
          toggleDropdown();
        } else {
          setHighlightedIndex((prev) => {
            const nextIndex = prev - 1;
            return nextIndex < 0 ? options.length - 1 : nextIndex;
          });
        }
        break;

      case "Home":
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;

      case "End":
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(options.length - 1);
        }
        break;

      case "Escape":
        if (isOpen) {
          event.preventDefault();
          closeDropdown();
        }
        break;

      case "Tab":
        if (isOpen) {
          closeDropdown();
        }
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex items-center justify-between gap-2 pixel-flat bg-card text-foreground transition-colors outline-none cursor-pointer select-none",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
          "hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
        )}
      >
        <div className="flex items-center gap-1.5 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            isOpen && "rotate-180 text-foreground",
          )}
        />
      </button>

      {isOpen && (
        <ul
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          aria-activedescendant={
            highlightedIndex >= 0
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          tabIndex={-1}
          className={cn(
            "absolute z-50 min-w-full max-h-64 overflow-y-auto pixel-raised bg-card p-1 text-foreground shadow-lg outline-none",
            openDirection === "down" ? "top-full mt-1" : "bottom-full mb-1",
            align === "right" ? "right-0" : "left-0",
            contentClassName,
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = highlightedIndex === index;

            return (
              <li
                key={option.value}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors",
                  option.disabled && "cursor-not-allowed opacity-40",
                  isSelected && "font-semibold text-primary",
                  isHighlighted && !option.disabled
                    ? "bg-secondary text-secondary-foreground"
                    : "text-foreground",
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.icon && (
                    <span className="shrink-0">{option.icon}</span>
                  )}
                  <span className="truncate">{option.label}</span>
                  {option.description && (
                    <span className="text-[10px] text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
