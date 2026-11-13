import type { ReactNode } from "react";
import { Tabs, TabsList, TabsHighlight, TabsHighlightItem, TabsTrigger, TabsContents, TabsContent } from "@animate-ui/react/primitives/tabs";

export { TabsContent };

/** Animated tabs (Animate UI): sliding highlight, sliding panels, auto height. */
export function SiteTabs({ tabs, value, onValueChange, children }: {
  tabs: { value: string; label: ReactNode }[]; value: string; onValueChange: (v: string) => void; children: ReactNode;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsHighlight className="tabs-hl">
        <TabsList className="tabs-list" aria-label="Views">
          {tabs.map(t => (
            <TabsHighlightItem key={t.value} value={t.value}>
              <TabsTrigger value={t.value} className="tab-trigger">{t.label}</TabsTrigger>
            </TabsHighlightItem>
          ))}
        </TabsList>
      </TabsHighlight>
      <TabsContents style={{ marginTop: 28 }}>{children}</TabsContents>
    </Tabs>
  );
}
