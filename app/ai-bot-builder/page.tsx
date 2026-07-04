'use client';

import { useState } from 'react';
import { Loader2, Download, Sparkles, AlertCircle } from 'lucide-react';

interface GeneratedBot {
  xml: string;
  params: {
    symbol: string;
    growth_rate: string;
    take_profit: number;
    initial_stake: number;
    martingale_size: number;
    profit_threshold: number;
    loss_threshold: number;
  };
}

const EXAMPLE_PROMPTS = [
  'Volatility 100 index, 2% growth rate, stop at $20 profit or $15 loss',
  'Conservative bot on Volatility 25, small $5 stake, take profit at $8',
  'Aggressive Volatility 75 bot, 3% growth, $15 starting stake',
];

export default function AiBotBuilderPage() {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedBot | null>(null);

  async function handleGenerate() {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/generate-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong generating the bot');
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong generating the bot');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-bot-${result.params.symbol}-${Date.now()}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Sparkles className="h-5 w-5" />
          AI Bot Builder
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the bot you want in plain English. This generates an Accumulator
          Martingale strategy — download the file and import it into Bot Builder like any
          other bot.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-foreground/5 p-4">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Volatility 100 index, 2% growth rate, stop at $20 profit or $15 loss"
          rows={4}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => setDescription(p)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-foreground/5"
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !description.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate bot'
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-border bg-foreground/5 p-4">
          <h2 className="text-sm font-medium text-foreground">Bot ready</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Symbol</dt>
            <dd className="text-foreground">{result.params.symbol}</dd>
            <dt className="text-muted-foreground">Growth rate</dt>
            <dd className="text-foreground">{Number(result.params.growth_rate) * 100}%</dd>
            <dt className="text-muted-foreground">Initial stake</dt>
            <dd className="text-foreground">${result.params.initial_stake}</dd>
            <dt className="text-muted-foreground">Stake step</dt>
            <dd className="text-foreground">${result.params.martingale_size}</dd>
            <dt className="text-muted-foreground">Take profit</dt>
            <dd className="text-foreground">${result.params.take_profit}</dd>
            <dt className="text-muted-foreground">Stop at profit</dt>
            <dd className="text-foreground">${result.params.profit_threshold}</dd>
            <dt className="text-muted-foreground">Stop at loss</dt>
            <dd className="text-foreground">${result.params.loss_threshold}</dd>
          </dl>

          <button
            onClick={handleDownload}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
          >
            <Download className="h-4 w-4" />
            Download bot XML
          </button>

          <p className="mt-3 text-xs text-muted-foreground">
            Import this in Bot Builder using the same &quot;Load&quot; flow you use for any
            other bot file. Nothing runs or trades automatically — you still confirm and
            run it yourself.
          </p>
        </div>
      )}
    </div>
  );
}
