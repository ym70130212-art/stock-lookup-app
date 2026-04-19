import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
const yf = new yahooFinance();
import stockMaster from '../../../data/jp-stocks.json';

type StockMasterRow = {
  code: string;
  name: string;
  aliases: string[];
};

type QuoteResult = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  symbol: string;
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

function resolveStock(input: string): StockMasterRow | null {
  const normalizedInput = normalize(input);

  const exactAlias = (stockMaster as StockMasterRow[]).find((row) =>
    row.aliases.some((alias) => normalize(alias) === normalizedInput)
  );
  if (exactAlias) return exactAlias;

  const exactName = (stockMaster as StockMasterRow[]).find(
    (row) => normalize(row.name) === normalizedInput
  );
  if (exactName) return exactName;

  const partialAlias = (stockMaster as StockMasterRow[]).find((row) =>
    row.aliases.some((alias) => normalize(alias).includes(normalizedInput) || normalizedInput.includes(normalize(alias)))
  );
  if (partialAlias) return partialAlias;

  const partialName = (stockMaster as StockMasterRow[]).find(
    (row) => normalize(row.name).includes(normalizedInput) || normalizedInput.includes(normalize(row.name))
  );
  if (partialName) return partialName;

  if (/^\d{4}$/.test(input.trim())) {
    const codeMatch = (stockMaster as StockMasterRow[]).find((row) => row.code === input.trim());
    if (codeMatch) return codeMatch;
  }

  return null;
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '取得失敗';
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toPasteLine(result: QuoteResult): string {
  if (result.error || result.price === null || result.change === null || result.changePercent === null) {
    return `${result.input} 該当銘柄または株価を取得できませんでした`;
  }

  const changeSign = result.change >= 0 ? '+' : '';
  const pctSign = result.changePercent >= 0 ? '+' : '';

  return `${result.code} ${result.name}(${result.input}) ${formatNumber(result.price)}円 前日比${changeSign}${formatNumber(result.change)}円(${pctSign}${formatNumber(result.changePercent, 2)}%)`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInputs = String(body.inputs ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rawInputs.length === 0) {
      return NextResponse.json({ error: '入力が空です。1行に1銘柄ずつ入力してください。' }, { status: 400 });
    }

    const limitedInputs = rawInputs.slice(0, 20);

    const results: QuoteResult[] = await Promise.all(
      limitedInputs.map(async (input) => {
        const resolved = resolveStock(input);

        if (!resolved) {
          return {
            input,
            code: '-',
            name: '-',
            price: null,
            change: null,
            changePercent: null,
            symbol: '-',
            error: '銘柄候補が見つかりませんでした',
          } satisfies QuoteResult;
        }

        const symbol = `${resolved.code}.T`;

        try {
          const quote = await yf.quote(symbol);
          const price = quote.regularMarketPrice ?? null;
          const prevClose = quote.regularMarketPreviousClose ?? null;
          const change =
            quote.regularMarketChange ??
            (price !== null && prevClose !== null ? price - prevClose : null);
          const changePercent =
            quote.regularMarketChangePercent ??
            (change !== null && prevClose ? (change / prevClose) * 100 : null);

          return {
            input,
            code: resolved.code,
            name: resolved.name,
            price,
            change,
            changePercent,
            symbol,
          } satisfies QuoteResult;
        } catch (error) {
          return {
            input,
            code: resolved.code,
            name: resolved.name,
            price: null,
            change: null,
            changePercent: null,
            symbol,
            error: error instanceof Error ? error.message : '株価取得に失敗しました',
          } satisfies QuoteResult;
        }
      })
    );

    const now = new Date();
    const fetchedAt = new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Asia/Tokyo',
    }).format(now);

    const pasteText = results.map(toPasteLine).join('\n');

    return NextResponse.json({
      fetchedAt,
      results,
      pasteText,
      note: 'Yahoo Finance系の非公式データに依存するため、遅延・取得失敗・仕様変更の可能性があります。重要な判断前には証券会社画面で確認してください。',
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
