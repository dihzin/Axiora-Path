"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type NativeSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type NativeSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  children?: React.ReactNode;
};

function parseSelectOptions(children: React.ReactNode): NativeSelectOption[] {
  const options: NativeSelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type !== "option") return;
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    const fallbackLabel =
      typeof props.children === "string" || typeof props.children === "number" ? String(props.children) : "";
    options.push({
      value: String(props.value ?? fallbackLabel),
      label: fallbackLabel,
      disabled: Boolean(props.disabled),
    });
  });
  return options;
}

const NativeSelect = React.forwardRef<HTMLButtonElement, NativeSelectProps>(
  ({ className, children, value, defaultValue, onChange, disabled, name, id, required, ...props }, ref) => {
    const rootRef = React.useRef<HTMLDivElement>(null);
    const [open, setOpen] = React.useState(false);
    const options = React.useMemo(() => parseSelectOptions(children), [children]);
    const initialValue = React.useMemo(() => {
      if (typeof defaultValue === "string") return defaultValue;
      if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
      return options[0]?.value ?? "";
    }, [defaultValue, options]);
    const [uncontrolledValue, setUncontrolledValue] = React.useState(initialValue);

    const isControlled = value !== undefined;
    const selectedValue = isControlled ? String(value ?? "") : uncontrolledValue;
    const selectedOption = options.find((opt) => opt.value === selectedValue) ?? options[0];

    React.useEffect(() => {
      if (!open) return;
      const handleOutside = (event: MouseEvent) => {
        if (!rootRef.current) return;
        if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
          setOpen(false);
        }
      };
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [open]);

    const handleSelect = (nextValue: string) => {
      if (!isControlled) setUncontrolledValue(nextValue);
      onChange?.({
        target: { value: nextValue } as EventTarget & HTMLSelectElement,
        currentTarget: { value: nextValue } as EventTarget & HTMLSelectElement,
      } as React.ChangeEvent<HTMLSelectElement>);
      setOpen(false);
    };

    const triggerProps = props as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>;

    return (
      <div ref={rootRef} className="relative">
        {name ? <input type="hidden" name={name} value={selectedOption?.value ?? ""} /> : null}
        <button
          {...triggerProps}
          id={id}
          ref={ref}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-required={required}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "axiora-chunky-btn axiora-chunky-btn--outline flex h-11 w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-[#26433f]",
            className,
          )}
        >
          <span className="truncate">{selectedOption?.label ?? "Selecionar"}</span>
          <svg className="h-4 w-4 shrink-0 text-[#4a668f]" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open ? (
          <div className="absolute z-[120] mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-[#d7c5ad] bg-[#fff9f1] p-1 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
            {options.map((option) => {
              const selected = option.value === selectedOption?.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                    selected ? "bg-[linear-gradient(180deg,#ffb170_0%,#ff8a45_100%)] text-white" : "text-[#2f527d] hover:bg-[#fff1e2]",
                    option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  },
);

NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
