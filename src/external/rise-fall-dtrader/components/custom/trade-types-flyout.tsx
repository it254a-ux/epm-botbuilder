
export interface TradeTypesFlyoutProps {
  activeTradeType: string;
  onSelectTradeType: (type: string) => void;
}

const TRADE_TYPES = [
  { label: 'Accumulators', value: 'accumulators', fire: true, comingSoon: false },
  { label: 'Rise/Fall', value: 'rise-fall', fire: true, comingSoon: false },
  { label: 'Matches/Differs', value: 'matches-differs', fire: false, comingSoon: false },
  { label: 'Over/Under', value: 'over-under', fire: false, comingSoon: false },
  { label: 'Even/Odd', value: 'even-odd', fire: false, comingSoon: false },
];

export function TradeTypesFlyout({ activeTradeType, onSelectTradeType }: TradeTypesFlyoutProps) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
      {TRADE_TYPES.map(item => (
        <button
          key={item.value}
          disabled={item.comingSoon}
          title={item.comingSoon ? 'Coming soon' : undefined}
          onClick={() => {
            if (!item.comingSoon) {
              onSelectTradeType(item.value);
            }
          }}
          className={`flex items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] font-medium transition-colors
            ${activeTradeType === item.value ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground'}
            ${item.comingSoon ? 'opacity-50 cursor-not-allowed' : 'hover:bg-foreground/5 hover:text-foreground cursor-pointer'}
          `}
        >
          {item.label}
          {item.fire && <span className="text-[10px]">🔥</span>}
          {item.comingSoon && (
            <span className="ml-1 text-[10px] text-muted-foreground font-normal">Soon</span>
          )}
        </button>
      ))}
    </div>
  );
}
