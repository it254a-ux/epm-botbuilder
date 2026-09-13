
export interface ContractTypeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface ContractTab {
  label: string;
  value: string;
  comingSoon?: boolean;
}

const TABS: ContractTab[] = [
  { label: 'Rise/Fall', value: 'rise-fall' },
  { label: 'Accumulators', value: 'accumulators' },
  { label: 'Matches/Differs', value: 'matches-differs' },
  { label: 'Over/Under', value: 'over-under' },
  { label: 'Even/Odd', value: 'even-odd' },
];

export function ContractTypeTabs({ activeTab, onTabChange }: ContractTypeTabsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {TABS.map(tab => (
        <button
          key={tab.value}
          disabled={tab.comingSoon}
          title={tab.comingSoon ? 'Coming soon' : undefined}
          onClick={() => !tab.comingSoon && onTabChange(tab.value)}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap
            ${activeTab === tab.value
              ? 'border-foreground/30 text-foreground bg-foreground/5'
              : 'border-border text-muted-foreground'}
            ${tab.comingSoon ? 'opacity-50 cursor-not-allowed' : 'hover:bg-foreground/5 cursor-pointer'}
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
