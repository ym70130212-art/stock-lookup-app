import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import stockMaster from '../../../data/jp-stocks.json';

const yf = new yahooFinance();

type QuoteResult = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  quoteTime: number | null;
  error?: string;
};

// 入力処理
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

// 日本時間フォーマット
function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

// 銘柄時刻（日時付き）
function formatQuoteTime(ts: number | null): string {
  if (!ts) return '--:--:--';

  const date = new Date(ts * 1000);

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

// 出力フォーマット
function toLine(r: QuoteResult): string {
  if (
    r.error ||
    r.price === null ||
    r.change === null ||
    r.changePercent === null
  ) {
    return `${r.code} ${r.name} 取得失敗`;
  }

  const price = Math.round(r.price);
  const change = Math.round(r.change);
  const pct = r.changePercent;

  const changeStr = `${change >= 0 ? '+' : ''}${change}`;
  const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

  const timeStr = formatQuoteTime(r.quoteTime);

  return `${r.code} ${r.name} ${price} ${changeStr} (${pctStr}) [${timeStr}]`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs = parseInputs(body);

    const results: QuoteResult[] = await Promise.all(
      inputs.map(async (input) => {
        const code = input;
        const symbol = `${code}.T`;

        try {
          // ★ ここが核心（1分足取得）
          const chart = await yf.chart(symbol, {
            interval: '1m',
            range: '1d',
          });

          const meta = chart.meta;
          const timestamps = chart.timestamp;
          const closes = chart.indicators.quote[0].close;

          if (!timestamps || !closes) {
            throw new Error('データなし');
          }

          // 最新データ
          const lastIndex = closes.length - 1;
          const price = closes[lastIndex];
          const quoteTime = timestamps[lastIndex];

          // 前日終値
          const prevClose =
            meta.previousClose ?? meta.chartPreviousClose ?? null;

          const change =
            price !== null && prevClose !== null
              ? price - prevClose
              : null;

          const changePercent =
            change !== null && prevClose
              ? (change / prevClose) * 100
              : null;

          return {
            input,
            code,
            name: input,
            price,
            change,
            changePercent,
            quoteTime,
          };
        } catch (e) {
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
      results.map(toLine).join('\n');

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
