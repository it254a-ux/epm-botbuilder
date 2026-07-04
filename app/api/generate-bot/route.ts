import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Valid Deriv synthetic index symbols this template supports (all live under
// MARKET_LIST=synthetic_index, SUBMARKET_LIST=random_index, same as the
// reference bot). Keeping this whitelist strict means the AI can never
// slot in a symbol string that doesn't actually exist on Deriv.
const VALID_SYMBOLS = [
  '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
];

// Accumulator growth rate only accepts these five values on Deriv.
const VALID_GROWTH_RATES = ['0.01', '0.02', '0.03', '0.04', '0.05'];

interface BotParams {
  symbol: string;
  growth_rate: string;
  take_profit: number;
  initial_stake: number;
  martingale_size: number;
  profit_threshold: number;
  loss_threshold: number;
}

const DEFAULTS: BotParams = {
  symbol: '1HZ100V',
  growth_rate: '0.01',
  take_profit: 10,
  initial_stake: 10,
  martingale_size: 10,
  profit_threshold: 10,
  loss_threshold: 10,
};

function clampPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // Round to 2 decimal places to keep stake values sane.
  return Math.round(n * 100) / 100;
}

async function extractParams(description: string): Promise<BotParams> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  const systemPrompt = `You extract trading bot parameters from a user's plain-English description of a Martingale/Accumulator strategy for Deriv.

Respond ONLY with a raw JSON object, no markdown fences, no preamble, no explanation. The JSON must have exactly these keys:
- "symbol": one of ${JSON.stringify(VALID_SYMBOLS)} (pick the closest match to what the user described; default to "1HZ100V" if unclear or unspecified)
- "growth_rate": one of ${JSON.stringify(VALID_GROWTH_RATES)} as a string (default "0.01" if unspecified)
- "take_profit": a positive number, the take-profit amount per trade in USD (default 10)
- "initial_stake": a positive number, the starting stake in USD (default 10)
- "martingale_size": a positive number, the stake step/increment used to grow the stake after a loss (default 10)
- "profit_threshold": a positive number, total profit at which the bot stops trading (default 10)
- "loss_threshold": a positive number, total loss at which the bot stops trading (default 10)

If the user's description doesn't mention a value, use the default. Never invent a symbol not in the allowed list.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const messageContent = data?.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error('No text response from model');
  }

  const cleaned = messageContent.replace(/```json|```/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Could not parse model response as JSON');
  }

  // Validate + sanitize every field against strict whitelists/ranges.
  // We never trust the model's output directly for values that get
  // substituted into the XML.
  const symbol = VALID_SYMBOLS.includes(parsed.symbol) ? parsed.symbol : DEFAULTS.symbol;
  const growth_rate = VALID_GROWTH_RATES.includes(String(parsed.growth_rate))
    ? String(parsed.growth_rate)
    : DEFAULTS.growth_rate;

  return {
    symbol,
    growth_rate,
    take_profit: clampPositiveNumber(parsed.take_profit, DEFAULTS.take_profit),
    initial_stake: clampPositiveNumber(parsed.initial_stake, DEFAULTS.initial_stake),
    martingale_size: clampPositiveNumber(parsed.martingale_size, DEFAULTS.martingale_size),
    profit_threshold: clampPositiveNumber(parsed.profit_threshold, DEFAULTS.profit_threshold),
    loss_threshold: clampPositiveNumber(parsed.loss_threshold, DEFAULTS.loss_threshold),
  };
}

function fillTemplate(params: BotParams): string {
  const templatePath = path.join(process.cwd(), 'app', 'api', 'generate-bot', 'template-martingale-accumulator.xml');
  let xml = fs.readFileSync(templatePath, 'utf-8');

  xml = xml
    .replace('{{SYMBOL}}', params.symbol)
    .replace('{{GROWTH_RATE}}', params.growth_rate)
    .replace('{{TAKE_PROFIT}}', String(params.take_profit))
    .replace('{{INITIAL_STAKE}}', String(params.initial_stake))
    .replace('{{MARTINGALE_SIZE}}', String(params.martingale_size))
    .replace('{{PROFIT_THRESHOLD}}', String(params.profit_threshold))
    .replace('{{LOSS_THRESHOLD}}', String(params.loss_threshold));

  return xml;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description: string = (body?.description || '').trim();

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: 'Description is too long (max 2000 characters)' }, { status: 400 });
    }

    const params = await extractParams(description);
    const xml = fillTemplate(params);

    return NextResponse.json({ xml, params });
  } catch (err: any) {
    console.error('generate-bot error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate bot' },
      { status: 500 }
    );
  }
}
