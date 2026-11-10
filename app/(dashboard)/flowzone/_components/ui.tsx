"use client";

/**
 * Små UI-byggesten til FlowZone i Allio-Leads' stil.
 * Navne og props svarer til de shadcn-komponenter FlowZone blev bygget med, så komponenterne kunne flyttes uændret.
 */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { da } from "date-fns/locale";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Har komponenten fået sin egen baggrundsfarve, bruges variantens farver ikke (ellers vinder den tilfældigt i CSS'en). */
const hasOwnBackground = (className?: string) => /(^|\s)(hover:)?bg-/.test(className ?? "");

/* ---------- Button ---------- */

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-stone-900 text-white hover:bg-stone-800",
  outline: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  ghost: "text-stone-700 hover:bg-stone-100",
  secondary: "bg-stone-100 text-stone-800 hover:bg-stone-200",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  lg: "h-10 px-6 text-sm",
  icon: "h-9 w-9",
};

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        !hasOwnBackground(className) && BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Card ---------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-stone-200 bg-white shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold text-stone-900", className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-stone-500", className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

/* ---------- Badge ---------- */

const BADGE_VARIANTS = {
  default: "border-transparent bg-stone-900 text-white",
  secondary: "border-transparent bg-stone-100 text-stone-800",
  outline: "border-stone-300 text-stone-700",
  destructive: "border-transparent bg-red-600 text-white",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof BADGE_VARIANTS }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        hasOwnBackground(className) ? (/(^|\s)border-[a-z]+-\d/.test(className ?? "") ? "" : "border-transparent") : BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Form fields ---------- */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-stone-300 bg-white px-3 py-1 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-stone-700", className)} {...props} />;
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  className,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn("h-4 w-4 rounded border-stone-300 accent-stone-900", className)}
    />
  );
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-stone-900" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: {
  value: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0] ?? min}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      className={cn("w-full accent-stone-900", className)}
    />
  );
}

export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-stone-200", className)}>
      <div className="h-full bg-stone-900 transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-stone-200", className)} />;
}

export function Alert({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border p-4 text-sm",
        variant === "destructive" ? "border-red-300 bg-red-50 text-red-800" : "border-stone-200 bg-white",
        className,
      )}
      {...props}
    />
  );
}
export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm", className)} {...props} />;
}

/* ---------- Select (native <select> med samme API) ---------- */

type SelectItemProps = { value: string; children?: ReactNode };

export function SelectItem(_props: SelectItemProps): null {
  return null;
}
export function SelectContent({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function SelectTrigger({ className }: { className?: string; children?: ReactNode }) {
  return <span className={className} />;
}
export function SelectValue(_props: { placeholder?: string }): null {
  return null;
}

function collectSelectItems(children: ReactNode, out: SelectItemProps[] = []): SelectItemProps[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: string; children?: ReactNode };
    if (child.type === SelectItem) out.push({ value: String(props.value), children: props.children });
    else if (props.children) collectSelectItems(props.children, out);
  });
  return out;
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}) {
  const items = collectSelectItems(children);
  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className="flex h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {typeof item.children === "string" || typeof item.children === "number" ? item.children : item.value}
        </option>
      ))}
    </select>
  );
}

/* ---------- Tabs ---------- */

const TabsContext = createContext<{ value: string; setValue: (v: string) => void } | null>(null);

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const setValue = useCallback(
    (v: string) => {
      setInner(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1 text-stone-600", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ value, className, children }: { value: string; className?: string; children?: ReactNode }) {
  const ctx = useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx?.setValue(value)}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        active ? "bg-white text-stone-900 shadow-sm" : "hover:text-stone-900",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children?: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return <div className={className}>{children}</div>;
}

/* ---------- Collapsible ---------- */

const CollapsibleContext = createContext<{ open: boolean; setOpen: (o: boolean) => void } | null>(null);

export function Collapsible({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const current = open ?? inner;
  const setOpen = (o: boolean) => {
    setInner(o);
    onOpenChange?.(o);
  };
  return <CollapsibleContext.Provider value={{ open: current, setOpen }}>{children}</CollapsibleContext.Provider>;
}

export function CollapsibleTrigger({ children }: { asChild?: boolean; children: ReactElement }) {
  const ctx = useContext(CollapsibleContext);
  return withClick(children, () => ctx?.setOpen(!ctx.open));
}

export function CollapsibleContent({ className, children }: { className?: string; children?: ReactNode }) {
  const ctx = useContext(CollapsibleContext);
  if (!ctx?.open) return null;
  return <div className={className}>{children}</div>;
}

function withClick(child: ReactElement, onClick: () => void) {
  const props = child.props as { onClick?: (e: React.MouseEvent) => void };
  return cloneElement(child as ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e);
      onClick();
    },
  });
}

/* ---------- Popover (placeres fast ved knappen, så den ikke klippes af en dialog) ---------- */

const PopoverContext = createContext<{
  open: boolean;
  setOpen: (o: boolean) => void;
  anchor: React.RefObject<HTMLSpanElement | null>;
} | null>(null);

export function Popover({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement | null>(null);
  return (
    <PopoverContext.Provider value={{ open, setOpen, anchor }}>
      <span ref={anchor} className="relative inline-block w-full">
        {children}
      </span>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ children }: { asChild?: boolean; children: ReactElement }) {
  const ctx = useContext(PopoverContext);
  return withClick(children, () => ctx?.setOpen(!ctx.open));
}

export function PopoverContent({
  align = "start",
  className,
  children,
}: {
  align?: "start" | "end" | "center";
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useContext(PopoverContext);
  const panel = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!ctx?.open || !ctx.anchor.current) return;
    const rect = ctx.anchor.current.getBoundingClientRect();
    const width = panel.current?.offsetWidth ?? 0;
    const left = align === "end" ? rect.right - width : align === "center" ? rect.left + rect.width / 2 - width / 2 : rect.left;
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [ctx?.open, ctx?.anchor, align]);

  useEffect(() => {
    if (!ctx?.open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || ctx.anchor.current?.contains(target)) return;
      ctx.setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ctx.setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  if (!ctx?.open) return null;
  return createPortal(
    <div
      ref={panel}
      className={cn("fixed z-[200] rounded-lg border border-stone-200 bg-white p-3 shadow-lg", className)}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      <PopoverCloseContext.Provider value={() => ctx.setOpen(false)}>{children}</PopoverCloseContext.Provider>
    </div>,
    document.body,
  );
}

const PopoverCloseContext = createContext<(() => void) | null>(null);

/* ---------- Calendar (enkel månedsvisning) ---------- */

export function Calendar({
  selected,
  onSelect,
  className,
}: {
  mode?: "single";
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  initialFocus?: boolean;
  className?: string;
}) {
  const closePopover = useContext(PopoverCloseContext);
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));
  const days = useMemo(() => {
    const first = startOfWeek(month, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);
  const today = new Date();

  return (
    <div className={cn("w-64 select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="Forrige måned">
          ‹
        </button>
        <span className="text-sm font-medium capitalize text-stone-800">{format(month, "MMMM yyyy", { locale: da })}</span>
        <button type="button" className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Næste måned">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-stone-500">
        {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => {
                onSelect?.(day);
                closePopover?.();
              }}
              className={cn(
                "h-8 rounded text-sm",
                !isSameMonth(day, month) && "text-stone-300",
                isSameDay(day, today) && !isSelected && "font-semibold text-stone-900 ring-1 ring-stone-300",
                isSelected ? "bg-stone-900 text-white" : "hover:bg-stone-100",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Dialog ---------- */

const DialogContext = createContext<{ open: boolean; setOpen: (o: boolean) => void } | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const current = open ?? inner;
  const setOpen = (o: boolean) => {
    setInner(o);
    onOpenChange?.(o);
  };
  return <DialogContext.Provider value={{ open: current, setOpen }}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({ children }: { asChild?: boolean; children: ReactElement }) {
  const ctx = useContext(DialogContext);
  return withClick(children, () => ctx?.setOpen(true));
}

export function DialogContent({ className, children }: { className?: string; children?: ReactNode }) {
  const ctx = useContext(DialogContext);
  useEffect(() => {
    if (!ctx?.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ctx.setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ctx]);
  if (!ctx?.open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => ctx.setOpen(false)}>
      <div
        role="dialog"
        className={cn("relative w-full rounded-xl bg-white p-6 shadow-xl", !/(^|\s)max-w-/.test(className ?? "") && "max-w-lg", className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-4 top-4 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Luk"
        >
          ✕
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1.5", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-stone-900", className)} {...props} />;
}

/* ---------- Toast ---------- */

type ToastInput = { title?: ReactNode; description?: ReactNode; variant?: "default" | "destructive"; duration?: number };
type ToastItem = ToastInput & { id: number };

let toastListeners: Array<(items: ToastItem[]) => void> = [];
let toastItems: ToastItem[] = [];
let toastSeq = 0;

function emitToasts() {
  toastListeners.forEach((l) => l(toastItems));
}

export function toast(input: ToastInput) {
  const id = ++toastSeq;
  toastItems = [...toastItems, { ...input, id }];
  emitToasts();
  window.setTimeout(() => {
    toastItems = toastItems.filter((t) => t.id !== id);
    emitToasts();
  }, input.duration ?? 4000);
}

export function useToast() {
  return { toast };
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toastItems);
  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[300] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-lg border p-3 shadow-lg",
            t.variant === "destructive" ? "border-red-300 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-900",
          )}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && <div className="mt-0.5 text-sm text-stone-600">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}
