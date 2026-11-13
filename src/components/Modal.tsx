import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Animated dialog (Animate UI) styled for the site. */
export function Modal({ open, onOpenChange, title, slate, description, wide, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; slate?: string; description?: string; wide?: boolean; children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn("dlg-content", wide && "wide")}>
        <div className="dlg">
          {slate && <div className="slate">{slate}</div>}
          <DialogTitle asChild><h3 style={{ fontSize: wide ? 18 : 24 }}>{title}</h3></DialogTitle>
          <DialogDescription className="sr-only">{description || title}</DialogDescription>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
