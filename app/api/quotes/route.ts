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
  openDiff: number | null;
  openDiffPercent: number | null;
  totalVolume: number | null;
  quoteTime: number | Date | null;
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
      (row.aliases || []).some((alias) => normalize(alias) === normalizedInput)
    ) ||
    rows.find((row) => normalize(row.name) === normalizedInput) ||
    rows.find((row) =>
      (row.aliases || []).some(
        (alias) =>
          normalize(alias).includes(normalizedInput) ||
          normalizedInput.includes(normalize(alias))
      )
    ) ||
    rows.find(
      (row) =>
        normalize(row.name).includes(normalizedInput) ||
        normalizedInput.includes(normalize(row.name))
    ) ||
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
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '-');
}

function formatQuoteTime(value: number | Date | null | undefined): string {
  if (!value) return '----.--.-- --:--:--';
  const date = value instanceof Date ? value : new Date(value * 1000);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '-');
}

function formatVolume(volume: number | null): string {
  if (volume === null || Number.isNaN(volume)) return '-';
  return volume.toLocaleString('ja-JP');
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  return Math.round(value).toString();
}

function toPasteLine(result: QuoteResult): string {
  if (
    result.error ||
    result.price === null ||
    result.change === null ||
    result.changePercent === null
  ) {
    return `${result.code || result.input} ${result.name || '-'} 取得失敗`;
  }

  return `${result.code} ${result.name} ${formatPrice(result.price)} ${formatSignedNumber(result.change)} (${formatSignedPercent(result.changePercent)}) / 始値比 ${formatSignedNumber(result.openDiff ?? 0)} (${formatSignedPercent(result.openDiffPercent ?? 0)}) 出来高 ${formatVolume(result.totalVolume)} [${formatQuoteTime(result.quoteTime)}]`;
}

function getTodayRangeInJst() {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return {
    period1: `${ymd}T00:00:00+09:00`,
    period2: `${ymd}T23:59:59+09:00`,
  };
}

async function fetchConfirmed(symbol: string) {
  const data = await yf.historical(symbol, { period1: '10d', interval: '1d' });
  if (!data || data.length < 2) throw new Error();

  const last = data[data.length - 1];
  const prev = data[data.length - 2];

  return {
    price: last.close,
    change: last.close - prev.close,
    changePercent: ((last.close - prev.close) / prev.close) * 100,
    openDiff: last.close - last.open,
    openDiffPercent: ((last.close - last.open) / last.open) * 100,
    totalVolume: last.volume,
    quoteTime: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs = parseInputs(body).slice(0, 20);
    const { period1, period2 } = getTodayRangeInJst();

    const results: QuoteResult[] = await Promise.all(
      inputs.map(async (input) => {
        let code = '';
        let name = '';
        let symbol = '';

        if (/^\d{4}$/.test(input)) {
          code = input;
          symbol = `${input}.T`;
        } else {
          const resolved = resolveStockByName(input);
          if (!resolved) return { input, code: '-', name: '-', price: null, change: null, changePercent: null, openDiff: null, openDiffPercent: null, totalVolume: null, quoteTime: null, error: '銘柄不明' };
          code = resolved.code;
          name = resolved.name;
          symbol = `${code}.T`;
        }

        try {
          const chart = await yf.chart(symbol, { interval: '1m', period1, period2 });
          const quotes = chart.quotes ?? [];
          const valid = quotes.filter(q => q.close && q.date);

          if (valid.length === 0) throw new Error();

          const first = valid[0];
          const last = valid[valid.length - 1];

          const prevClose = chart.meta?.previousClose ?? chart.meta?.chartPreviousClose;

          return {
            input,
            code,
            name,
            price: last.close,
            change: last.close - prevClose,
            changePercent: ((last.close - prevClose) / prevClose) * 100,
            openDiff: last.close - first.open,
            openDiffPercent: ((last.close - first.open) / first.open) * 100,
            totalVolume: valid.reduce((s, q) => s + (q.volume ?? 0), 0),
            quoteTime: last.date,
          };
        } catch {
          return {
            input,
            code: code || input,
            name: name || input,
            price: null,
            change: null,
            changePercent: null,
            openDiff: null,
            openDiffPercent: null,
            totalVolume: null,
            quoteTime: null,
            error: '取得失敗',
          };
        }
      })
    );

    // ★ここが今回の追加ロジック
    const allFailed = results.every(r => r.error);

    let finalResults = results;
    let headerNote = '';

    if (allFailed) {
      const fallback = await Promise.all(
        results.map(async (r) => {
          try {
            const symbol = `${r.code}.T`;
            const data = await fetchConfirmed(symbol);
            return { ...r, ...data, error: undefined };
          } catch {
            return r;
          }
        })
      );
      finalResults = fallback;
      headerNote = '※ 当日データ取得不可のため前営業日確定データ';
    }

    const text =
      `取得時刻: ${formatTimestamp(new Date())}\n` +
      (headerNote ? `${headerNote}\n` : '\n') +
      finalResults.map(toPasteLine).join('\n');

    return NextResponse.json({ pasteText: text });
  } catch (e) {
    return NextResponse.json({ error: '取得失敗' }, { status: 500 });
  }
}
