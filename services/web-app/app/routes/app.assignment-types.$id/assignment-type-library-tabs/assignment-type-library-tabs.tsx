import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

export type AssignmentTypeLibraryTabsProps = {
  howItWorksLabel: string;
  promptLibraryLabel?: string;
  howItWorksPanel: ReactNode;
  promptLibraryPanel: ReactNode;
  defaultTab?: 'how-it-works' | 'prompt-library';
};

export function AssignmentTypeLibraryTabs({
  howItWorksLabel,
  promptLibraryLabel = 'Prompt library',
  howItWorksPanel,
  promptLibraryPanel,
  defaultTab = 'how-it-works',
}: AssignmentTypeLibraryTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="pb-6">
      <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          value="how-it-works"
          className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          {howItWorksLabel}
        </TabsTrigger>
        <TabsTrigger
          value="prompt-library"
          className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          {promptLibraryLabel}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="how-it-works"
        className="mt-4"
        data-tour="type-directions"
      >
        {howItWorksPanel}
      </TabsContent>
      <TabsContent
        value="prompt-library"
        className="mt-4"
        data-tour="type-library"
      >
        {promptLibraryPanel}
      </TabsContent>
    </Tabs>
  );
}
