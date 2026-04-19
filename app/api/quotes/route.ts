import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import stockMaster from '../../../data/jp-stocks.json';

const yf = new yahooFinance();

type StockMasterRow = {
  code: string;
  name: string;
  aliases?: string[];
};

type ResultRow = {
  input: string;
  code: string;
  name: string;
  price: string;
  change: string;
};

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function formatPrice(value: number): string {
  return `${value.toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}円`;
}

function formatChange(change: number, changePercent: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}円 (${sign}${changePercent.toFixed(2)}%)`;
}

function findStockByNameOrAlias(input: string): StockMasterRow | null {
  const normalized = normalizeText(input);
  const rows = stockMaster as StockMasterRow[];

  for (const row of rows) {
    const nameMatched = normalizeText(row.name).includes(normalized);
    const aliasMatched = (row.aliases || []).some((alias) =>
      normalizeText(alias).includes(normalized)
    );

    if (nameMatched || aliasMatched) {
      return row;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputs: string[] = Array.isArray(body.inputs) ? body.inputs : [];

    const cleanedInputs = inputs
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0)
      .slice(0, 20);

    const results: ResultRow[] = [];

    for (const input of cleanedInputs) {
      try {
        let code = '';
        let name = '';
        let symbol = '';

        // 4桁コードなら JSON を見ずにそのまま東証コードとして扱う
        if (/^\d{4}$/.test(input)) {
          code = input;
          name = input; // 名前不明でも最低限コードは表示
          symbol = `${input}.T`;
        } else {
          // 企業名・略称は今まで通り JSON で解決
          const matched = findStockByNameOrAlias(input);

          if (!matched) {
            results.push({
              input,
              code: '-',
              name: '-',
              price: '-',
              change: '銘柄候補が見つかりませんでした',
            });
            continue;
          }

          code = matched.code;
          name = matched.name;
          symbol = `${matched.code}.T`;
        }

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
            price: '-',
            change: '株価データを取得できませんでした',
          });
          continue;
        }

        const diff = regularMarketPrice - regularMarketPreviousClose;
        const diffPercent = (diff / regularMarketPreviousClose) * 100;

        results.push({
          input,
          code,
          name,
          price: formatPrice(regularMarketPrice),
          change: formatChange(diff, diffPercent),
        });
      } catch {
        results.push({
          input,
          code: '-',
          name: '-',
          price: '-',
          change: '株価取得中にエラーが発生しました',
        });
      }
    }

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      results,
      gptText: results
        .map((row) => {
          if (row.code === '-' || row.price === '-') {
            return `${row.input} 該当銘柄または株価を取得できませんでした`;
          }
          return `${row.code} ${row.name}(${row.input}) ${row.price} 前日比${row.change}`;
        })
        .join('\n'),
    });
  } catch {
    return NextResponse.json(
      { error: '不正なリクエストです' },
      { status: 400 }
    );
  }
}
