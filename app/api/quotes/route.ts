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

// ★ 追加：配列／文字列両対応
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

// ★ 追加：時刻フォーマット固定
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ★ ここが最重要：出力フォーマット完全固定
function toPasteLine(result: QuoteResult): string {
  if (
    result.error ||
    result.price === null ||
    result.change === null ||
    result.changePercent === null
  ) {
    return `${result.code || result.input} ${result.name || "-"} 取得失敗`;
  }

  const price = Math.round(result.price);
  const change = Math.round(result.change);
  const pct = result.changePercent;

  const changeStr = `${change >= 0 ? "+" : ""}${change}`;
  const pctStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;

  return `${result.code} ${result.name} ${price} ${changeStr} (${pctStr})`;
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

    const results: QuoteResult[] = await Promise.all(
      limitedInputs.map(async (input) => {
        let code = '';
        let name = '';
        let symbol = '';

        // 4桁コード
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

            const matched = masterRows.find((row) => row.code === input);

            name =
              matched?.name ||
              quote.longName ||
              quote.shortName ||
              input;

            return {
              input,
              code,
              name,
              price,
              change,
              changePercent,
              symbol,
            };
          } catch (error) {
            return {
              input,
              code,
              name: input,
              price: null,
              change: null,
              changePercent: null,
              symbol,
              error: '取得失敗',
            };
          }
        }

        // 名前検索
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
            error: '銘柄不明',
          };
        }

        code = resolved.code;
        name = resolved.name;
        symbol = `${code}.T`;

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
          };
        } catch (error) {
          return {
            input,
            code,
            name,
            price: null,
            change: null,
            changePercent: null,
            symbol,
            error: '取得失敗',
          };
        }
      })
    );

    // ★ 出力生成（最重要）
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
      { error: '不明なエラーが発生しました' },
      { status: 500 }
    );
  }
}
