import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import stockMaster from '../../../data/jp-stocks.json';

const yf = new yahooFinance();

type StockMasterRow = {
  code: string;
  name: string;
  aliases?: string[];
};

type QuoteResult = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  quoteTime: number | null; // ★追加
  error?: string;
};

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　・\-－_]/g, '')
    .replace(/ホールディングス/g, 'hd')
    .replace(/グループ/g, 'group')
    .replace(/株式会社/g, '');
}

function resolveStockByName(input: string): StockMasterRow | null {
  const normalizedInput = normalize(input);
  const rows = stockMaster as StockMasterRow[];

  return (
    rows.find((row) =>
      (row.aliases || []).some((a) => normalize(a) === normalizedInput)
    ) ||
    rows.find((row) => normalize(row.name) === normalizedInput) ||
    rows.find((row) =>
      (row.aliases || []).some((a) =>
        normalize(a).includes(normalizedInput)
      )
    ) ||
    rows.find((row) => normalize(row.name).includes(normalizedInput)) ||
    null
  );
}

function parseInputs(body: any): string[] {
  const src = body?.inputs;
  if (Array.isArray(src)) {
    return src.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(src ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// 日本時間
function formatTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  ) as any;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

// ★追加：各銘柄の時刻
function formatQuoteTime(ts: number | null): string {
  if (!ts) return "--:--:--";

  const date = new Date(ts * 1000);

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

// ★ここが最重要
function toPasteLine(r: QuoteResult): string {
  if (
    r.error ||
    r.price === null ||
    r.change === null ||
    r.changePercent === null
  ) {
    return `${r.code || r.input} ${r.name || "-"} 取得失敗`;
  }

  const price = Math.round(r.price);
  const change = Math.round(r.change);
  const pct = r.changePercent;

  const changeStr = `${change >= 0 ? "+" : ""}${change}`;
  const pctStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;

  const timeStr = formatQuoteTime(r.quoteTime);

  return `${r.code} ${r.name} ${price} ${changeStr} (${pctStr}) [${timeStr}]`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs = parseInputs(body);

    if (inputs.length === 0) {
      return NextResponse.json(
        { error: '入力が空です' },
        { status: 400 }
      );
    }

    const master = stockMaster as StockMasterRow[];

    const results: QuoteResult[] = await Promise.all(
      inputs.slice(0, 20).map(async (input) => {
        let code = '';
        let name = '';
        let symbol = '';

        if (/^\d{4}$/.test(input)) {
          code = input;
          symbol = `${input}.T`;
        } else {
          const resolved = resolveStockByName(input);
          if (!resolved) {
            return {
              input,
              code: '-',
              name: '-',
              price: null,
              change: null,
              changePercent: null,
              quoteTime: null,
              error: '銘柄不明',
            };
          }
          code = resolved.code;
          name = resolved.name;
          symbol = `${code}.T`;
        }

        try {
          const q = await yf.quote(symbol);

          const price = q.regularMarketPrice ?? null;
          const prev = q.regularMarketPreviousClose ?? null;

          const change =
            q.regularMarketChange ??
            (price !== null && prev !== null ? price - prev : null);

          const pct =
            q.regularMarketChangePercent ??
            (change !== null && prev ? (change / prev) * 100 : null);

          const matched = master.find((m) => m.code === code);

          return {
            input,
            code,
            name: name || matched?.name || input,
            price,
            change,
            changePercent: pct,
            quoteTime: q.regularMarketTime ?? null, // ★ここ
          };
        } catch {
          return {
            input,
            code,
            name: input,
            price: null,
            change: null,
            changePercent: null,
            quoteTime: null,
            error: '取得失敗',
          };
        }
      })
    );

    const now = new Date();

    const pasteText =
      `取得時刻: ${formatTimestamp(now)}\n\n` +
      results.map(toPasteLine).join('\n');

    return NextResponse.json({
      pasteText,
      results,
    });
  } catch {
    return NextResponse.json(
      { error: 'エラー' },
      { status: 500 }
    );
  }
}
