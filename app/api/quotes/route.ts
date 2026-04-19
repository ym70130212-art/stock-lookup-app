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
  return text.trim().toLowerCase();
}

function findByNameOrAlias(input: string): StockMasterRow | null {
  const normalized = normalize(input);
  const rows = stockMaster as StockMasterRow[];

  for (const row of rows) {
    const nameMatched = normalize(row.name).includes(normalized);
    const aliasMatched = (row.aliases || []).some((alias) =>
      normalize(alias).includes(normalized)
    );

    if (nameMatched || aliasMatched) {
      return row;
    }
  }

  return null;
}

function formatGptLine(row: QuoteResult): string {
  if (row.error || row.price === null || row.change === null || row.changePercent === null) {
    return `${row.input} 該当銘柄または株価を取得できませんでした`;
  }

  const sign = row.change >= 0 ? '+' : '';
  return `${row.code} ${row.name}(${row.input}) ${row.price.toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}円 前日比${sign}${row.change.toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}円(${sign}${row.changePercent.toFixed(2)}%)`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs: string[] = Array.isArray(body.inputs) ? body.inputs : [];

    const cleanedInputs = inputs
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0)
      .slice(0, 20);

    const results: QuoteResult[] = [];

    for (const input of cleanedInputs) {
      try {
        let code = '';
        let name = '';
        let symbol = '';

        // 4桁コードなら直接取得
        if (/^\d{4}$/.test(input)) {
          code = input;
          symbol = `${input}.T`;

          const quote = await yf.quote(symbol);

          const regularMarketPrice = Number(quote.regularMarketPrice);
          const regularMarketPreviousClose = Number(quote.regularMarketPreviousClose);

          if (
            !Number.isFinite(regularMarketPrice) ||
            !Number.isFinite(regularMarketPreviousClose) ||
            regularMarketPreviousClose === 0
          ) {
            results.push({
              input,
              code,
              name: input,
              price: null,
              change: null,
              changePercent: null,
              symbol,
              error: '株価データを取得できませんでした',
            });
            continue;
          }

          name =
            typeof quote.longName === 'string' && quote.longName.trim()
              ? quote.longName
              : typeof quote.shortName === 'string' && quote.shortName.trim()
              ? quote.shortName
              : input;

          results.push({
            input,
            code,
            name,
            price: regularMarketPrice,
            change: regularMarketPrice - regularMarketPreviousClose,
            changePercent:
              ((regularMarketPrice - regularMarketPreviousClose) /
                regularMarketPreviousClose) *
              100,
            symbol,
          });

          continue;
        }

        // 企業名・略称はJSONで解決
        const matched = findByNameOrAlias(input);

        if (!matched) {
          results.push({
            input,
            code: '',
            name: '',
            price: null,
            change: null,
            changePercent: null,
            symbol: '',
            error: '銘柄候補が見つかりませんでした',
          });
          continue;
        }

        code = matched.code;
        name = matched.name;
        symbol = `${matched.code}.T`;

        const quote = await yf.quote(symbol);

        const regularMarketPrice = Number(quote.regularMarketPrice);
        const regularMarketPreviousClose = Number(quote.regularMarketPreviousClose);

        if (
          !Number.isFinite(regularMarketPrice) ||
          !Number.isFinite(regularMarketPreviousClose) ||
          regularMarketPreviousClose === 0
        ) {
          results.push({
            input,
            code,
            name,
            price: null,
            change: null,
            changePercent: null,
            symbol,
            error: '株価データを取得できませんでした',
          });
          continue;
        }

        results.push({
          input,
          code,
          name,
          price: regularMarketPrice,
          change: regularMarketPrice - regularMarketPreviousClose,
          changePercent:
            ((regularMarketPrice - regularMarketPreviousClose) /
              regularMarketPreviousClose) *
            100,
          symbol,
        });
      } catch {
        results.push({
          input,
          code: /^\d{4}$/.test(input) ? input : '',
          name: /^\d{4}$/.test(input) ? input : '',
          price: null,
          change: null,
          changePercent: null,
          symbol: /^\d{4}$/.test(input) ? `${input}.T` : '',
          error: '株価取得中にエラーが発生しました',
        });
      }
    }

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      results,
      gptText: results.map(formatGptLine).join('\n'),
    });
  } catch {
    return NextResponse.json(
      {
        fetchedAt: new Date().toISOString(),
        results: [],
        gptText: '',
        error: '不正なリクエストです',
      },
      { status: 400 }
    );
  }
}
