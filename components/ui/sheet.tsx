"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/* ─── Right-side sheet resizable width ─── */
const SHEET_WIDTH_KEY = "controlhub.sheetWidth";
const DEFAULT_SHEET_WIDTH = 960;
const MIN_SHEET_WIDTH = 720;
const MAX_SHEET_WIDTH_RATIO = 0.92;

function clampSheetWidth(w: number): number {
  if (typeof window === "undefined") return w;
  const max = window.innerWidth * MAX_SHEET_WIDTH_RATIO;
  return Math.max(MIN_SHEET_WIDTH, Math.min(w, max));
}

function readSheetWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SHEET_WIDTH;
  try {
    const raw = localStorage.getItem(SHEET_WIDTH_KEY);
    if (raw) {
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= MIN_SHEET_WIDTH) {
        return clampSheetWidth(n);
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SHEET_WIDTH;
}

function persistSheetWidth(w: number): void {
  try {
    localStorage.setItem(SHEET_WIDTH_KEY, String(w));
  } catch {
    // ignore
  }
}

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const isRight = side === "right";
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [sheetWidth, setSheetWidth] = React.useState(DEFAULT_SHEET_WIDTH);
  const dragging = React.useRef(false);
  const dragOrigin = React.useRef({ x: 0, width: 0 });

  // Load persisted width on mount (client only)
  React.useEffect(() => {
    if (isRight) {
      setSheetWidth(readSheetWidth());
    }
  }, [isRight]);

  // Clamp on viewport resize
  React.useEffect(() => {
    if (!isRight) return;
    const onResize = () => setSheetWidth((w) => clampSheetWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isRight]);

  const rightStyle = isRight
    ? {
        width: `${sheetWidth}px`,
        maxWidth: `${MAX_SHEET_WIDTH_RATIO * 100}vw`,
      }
    : undefined;

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        ref={popupRef}
        data-slot="sheet-content"
        data-side={side}
        initialFocus={false}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition-[opacity,transform] duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm",
          className,
        )}
        style={rightStyle}
        {...props}
      >
        {isRight && (
          <div
            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-border/60 active:bg-border"
            onPointerDown={(e) => {
              dragging.current = true;
              dragOrigin.current = { x: e.clientX, width: sheetWidth };
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (!dragging.current || !popupRef.current) return;
              const delta = dragOrigin.current.x - e.clientX;
              const next = clampSheetWidth(dragOrigin.current.width + delta);
              popupRef.current.style.width = `${next}px`;
            }}
            onPointerUp={() => {
              if (!dragging.current || !popupRef.current) return;
              dragging.current = false;
              const raw = parseInt(popupRef.current.style.width, 10);
              if (!Number.isNaN(raw)) {
                const final = clampSheetWidth(raw);
                setSheetWidth(final);
                persistSheetWidth(final);
              }
            }}
          />
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "absolute top-3 right-3",
                )}
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
