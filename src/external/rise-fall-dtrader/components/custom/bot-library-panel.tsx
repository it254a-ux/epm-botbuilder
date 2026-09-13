
import { BOT_LIBRARY } from '@/external/rise-fall-dtrader/lib/bots-library';
import type { StrategyProgram } from '@deriv/core';

interface BotLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectBot: (program: StrategyProgram) => void;
}

const RISK_COLORS: Record<string, string> = {
  Low: 'text-emerald-500 bg-emerald-500/10',
  Medium: 'text-yellow-500 bg-yellow-500/10',
  High: 'text-orange-500 bg-orange-500/10',
  Aggressive: 'text-red-500 bg-red-500/10',
};

export function BotLibraryPanel({ open, onClose, onSelectBot }: BotLibraryPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Bot Library</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {BOT_LIBRARY.map((bot) => (
            <div key={bot.id} className="rounded-lg border border-border p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{bot.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${RISK_COLORS[bot.riskLabel]}`}>
                  {bot.riskLabel}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{bot.description}</p>
              <button
                onClick={() => onSelectBot(bot.program)}
                className="mt-1 self-start rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90"
              >
                Use this bot
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
