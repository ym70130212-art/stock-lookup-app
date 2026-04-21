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

  const exactAlias = rows.find((row) =>
    (row.aliases || []).some((alias) => normalize(alias) === normalizedInput)
  );
  if (exactAlias) return exactAlias;

  const exactName = rows.find((row) => normalize(row.name) === normalizedInput);
  if (exactName) return exactName;

  const partialAlias = rows.find((row) =>
    (row.aliases || []).some(
      (alias) =>
        normalize(alias).includes(normalizedInput) ||
        normalizedInput.includes(normalize(alias))
    )
  );
  if (partialAlias) return partialAlias;

  const partialName = rows.find(
    (row) =>
      normalize(row.name).includes(normalizedInput) ||
      normalizedInput.includes(normalize(row.name))
  );
  if (partialName) return partialName;

  return null;
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
    parts
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function formatQuoteTime(value: number | Date | null | undefined): string {
  if (!value) return '----.--.-- --:--:--';

  const date = value instanceof Date ? value : new Date(value * 1000);

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function formatVolume(volume: number | null): string {
  if (volume === null || Number.isNaN(volume)) return '-';
  return volume.toLocaleString('ja-JP');
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

  const price =
    Math.abs(result.price - Math.round(result.price)) < 0.000001
      ? String(Math.round(result.price))
      : String(Number(result.price.toFixed(1)));

  const change =
    Math.abs(result.change) >= 1
      ? Math.round(result.change)
      : Number(result.change.toFixed(1));

  const pct = result.changePercent;

  const changeStr = `${change >= 0 ? '+' : ''}${change}`;
  const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  const volumeStr = formatVolume(result.totalVolume);
  const timeStr = formatQuoteTime(result.quoteTime);

  return `${result.code} ${result.name} ${price} ${changeStr} (${pctStr}) 出来高 ${volumeStr} [${timeStr}]`;
}

function getTodayRangeInJst() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const map = Object.fromEntries(
    parts
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const ymd = `${map.year}-${map.month}-${map.day}`;
  const period1 = `${ymd}T00:00:00+09:00`;
  const period2 = `${ymd}T23:59:59+09:00`;

  return { period1, period2 };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInputs = parseInputs(body);

    if (rawInputs.length === 0) {
      return NextResponse.json(
        { error: '入力が空です。1行に1銘柄ずつ入力してください。' },
        { status: 400 }
      );
    }

    const limitedInputs = rawInputs.slice(0, 20);
    const masterRows = stockMaster as StockMasterRow[];
    const { period1, period2 } = getTodayRangeInJst();

    const results: QuoteResult[] = await Promise.all(
      limitedInputs.map(async (input) => {
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
              totalVolume: null,
              quoteTime: null,
              error: '銘柄不明',
            };
          }

          code = resolved.code;
          name = resolved.name;
          symbol = `${code}.T`;
        }

        try {
          const chart = await yf.chart(symbol, {
            interval: '1m',
            period1,
            period2,
          });

          const quoteSeries = chart.quotes ?? [];
          const validQuotes = quoteSeries.filter(
            (q) =>
              q.close !== null &&
              q.close !== undefined &&
              q.date !== null &&
              q.date !== undefined
          );

          if (validQuotes.length === 0) {
            throw new Error('当日1分足データなし');
          }

          const last = validQuotes[validQuotes.length - 1];
          const price = last.close ?? null;

          const prevClose =
            chart.meta?.previousClose ??
            chart.meta?.chartPreviousClose ??
            null;

          const change =
            price !== null && prevClose !== null ? price - prevClose : null;

          const changePercent =
            change !== null && prevClose
              ? (change / prevClose) * 100
              : null;

          const totalVolume = validQuotes.reduce((sum, q) => {
            return sum + (q.volume ?? 0);
          }, 0);

          const matched = masterRows.find((row) => row.code === code);

          const displayName =
            name ||
            matched?.name ||
            (typeof chart.meta?.longName === 'string' && chart.meta.longName.trim()
              ? chart.meta.longName
              : typeof chart.meta?.shortName === 'string' && chart.meta.shortName.trim()
                ? chart.meta.shortName
                : input);

          return {
            input,
            code,
            name: displayName,
            price,
            change,
            changePercent,
            totalVolume,
            quoteTime: last.date ?? null,
          };
        } catch (e) {
          console.error(e);
          return {
            input,
            code: code || input,
            name: name || input,
            price: null,
            change: null,
            changePercent: null,
            totalVolume: null,
            quoteTime: null,
            error: '取得失敗',
          };
        }
      })
    );

    const now = new Date();
    const fetchedAt = formatTimestamp(now);

    const pasteText =
      `取得時刻: ${fetchedAt}\n\n` +
      results.map(toPasteLine).join('\n');

    return NextResponse.json({
      fetchedAt,
      results,
      pasteText,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      },
      { status: 500 }
    );
  }
}
