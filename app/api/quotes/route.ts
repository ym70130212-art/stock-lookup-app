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

function formatNumber(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '取得失敗';
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toPasteLine(result: QuoteResult): string {
  if (
    result.error ||
    result.price === null ||
    result.change === null ||
    result.changePercent === null
  ) {
    return `${result.input} 該当銘柄または株価を取得できませんでした`;
  }

  const changeSign = result.change >= 0 ? '+' : '';
  const pctSign = result.changePercent >= 0 ? '+' : '';

  return `${result.code} ${result.name}(${result.input}) ${formatNumber(result.price)}円 前日比${changeSign}${formatNumber(result.change)}円(${pctSign}${formatNumber(result.changePercent, 2)}%)`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // page.tsx からは文字列で届く
    const rawInputs = String(body.inputs ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rawInputs.length === 0) {
      return NextResponse.json(
        { error: '入力が空です。1行に1銘柄ずつ入力してください。' },
        { status: 400 }
      );
    }

    const limitedInputs = rawInputs.slice(0, 20);

    const results: QuoteResult[] = await Promise.all(
      limitedInputs.map(async (input) => {
        let code = '';
        let name = '';
        let symbol = '';

        // 4桁コードなら直接取得
        if (/^\d{4}$/.test(input)) {
          code = input;
          symbol = `${input}.T`;

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

            name =
              typeof quote.longName === 'string' && quote.longName.trim()
                ? quote.longName
                : typeof quote.shortName === 'string' && quote.shortName.trim()
                ? quote.shortName
                : input;

            return {
              input,
              code,
              name,
              price,
              change,
              changePercent,
              symbol,
            } satisfies QuoteResult;
          } catch (error) {
            return {
              input,
              code,
              name: input,
              price: null,
              change: null,
              changePercent: null,
              symbol,
              error: error instanceof Error ? error.message : '株価取得に失敗しました',
            } satisfies QuoteResult;
          }
        }

        // 企業名・略称はJSONで解決
        const resolved = resolveStockByName(input);

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

        code = resolved.code;
        name = resolved.name;
        symbol = `${resolved.code}.T`;

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
            code,
            name,
            price,
            change,
            changePercent,
            symbol,
          } satisfies QuoteResult;
        } catch (error) {
          return {
            input,
            code,
            name,
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
