import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import stockMaster from '../../../data/jp-stocks.json';

const yf = new yahooFinance();

const MAX_INPUTS = 100;
const BATCH_SIZE = 20;
const FALLBACK_SEARCH_DAYS = 7;
const PREVIOUS_CLOSE_SEARCH_DAYS = 10;

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
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
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
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function formatVolume(volume: number | null): string {
  if (volume === null || Number.isNaN(volume)) return '-';
  return volume.toLocaleString('ja-JP');
}

function formatSignedNumber(value: number): string {
  const rounded =
    Math.abs(value) >= 1
      ? Math.round(value)
      : Number(value.toFixed(1));

  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  const rounded =
    Math.abs(value - Math.round(value)) < 0.000001
      ? Math.round(value)
      : Number(value.toFixed(1));

  return String(rounded);
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

  const priceStr = formatPrice(result.price);
  const changeStr = formatSignedNumber(result.change);
  const changePctStr = formatSignedPercent(result.changePercent);

  const openDiffStr =
    result.openDiff !== null ? formatSignedNumber(result.openDiff) : '-';
  const openDiffPctStr =
    result.openDiffPercent !== null ? formatSignedPercent(result.openDiffPercent) : '-';

  const volumeStr = formatVolume(result.totalVolume);
  const timeStr = formatQuoteTime(result.quoteTime);

  return `${result.code} ${result.name} ${priceStr} ${changeStr} (${changePctStr}) / 始値比 ${openDiffStr} (${openDiffPctStr}) 出来高 ${volumeStr} [${timeStr}]`;
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
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const ymd = `${map.year}-${map.month}-${map.day}`;
  const period1 = `${ymd}T00:00:00+09:00`;
  const period2 = `${ymd}T23:59:59+09:00`;

  return { period1, period2 };
}

function getCurrentJstParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  return Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;
}

function getJstYmdByOffset(offsetDays: number): string {
  const current = getCurrentJstParts();
  const todayJst = new Date(`${current.year}-${current.month}-${current.day}T00:00:00+09:00`);
  const target = new Date(todayJst.getTime() + offsetDays * 24 * 60 * 60 * 1000);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  ) as Record<string, string>;

  return `${map.year}-${map.month}-${map.day}`;
}

function getIntradayRangeForJstYmd(ymd: string) {
  return {
    period1: `${ymd}T00:00:00+09:00`,
    period2: `${ymd}T23:59:59+09:00`,
  };
}

function shouldTryTodayAsConfirmed(): boolean {
  const current = getCurrentJstParts();
  const hour = Number(current.hour);
  const minute = Number(current.minute);

  return hour > 15 || (hour === 15 && minute >= 30);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchValidIntradayQuotesForDate(symbol: string, ymd: string) {
  const { period1, period2 } = getIntradayRangeForJstYmd(ymd);

  const chart = await yf.chart(symbol, {
    interval: '1m',
    period1,
    period2,
  });

  const quoteSeries = chart.quotes ?? [];
  const validQuotes = quoteSeries.filter(
    (q) =>
      q.date !== null &&
      q.date !== undefined &&
      q.close !== null &&
      q.close !== undefined
  );

  return { chart, validQuotes };
}

async function findPreviousTradingDayClose(symbol: string, baseYmd: string) {
  const baseDate = new Date(`${baseYmd}T00:00:00+09:00`);

  for (let i = 1; i <= PREVIOUS_CLOSE_SEARCH_DAYS; i += 1) {
    const targetDate = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(targetDate);

    const map = Object.fromEntries(
      parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    ) as Record<string, string>;

    const targetYmd = `${map.year}-${map.month}-${map.day}`;

    try {
      const { validQuotes } = await fetchValidIntradayQuotesForDate(symbol, targetYmd);

      if (validQuotes.length === 0) {
        continue;
      }

      const last = validQuotes[validQuotes.length - 1];
      const close = Number(last.close);

      if (Number.isFinite(close)) {
        return close;
      }
    } catch (e) {
      console.error('[fallback:prevClose:catch]', {
        symbol,
        targetYmd,
        error: e instanceof Error ? e.message : e,
      });
    }
  }

  return null;
}

async function fetchConfirmedQuote(symbol: string) {
  const startDaysBack = shouldTryTodayAsConfirmed() ? 0 : 1;

  console.log('[fallback:start]', {
    symbol,
    startDaysBack,
    searchDays: FALLBACK_SEARCH_DAYS,
  });

  for (let offset = startDaysBack; offset <= FALLBACK_SEARCH_DAYS; offset += 1) {
    const ymd = getJstYmdByOffset(-offset);

    try {
      console.log('[fallback:tryDate]', {
        symbol,
        ymd,
      });

      const { chart, validQuotes } = await fetchValidIntradayQuotesForDate(symbol, ymd);

      console.log('[fallback:intradayRows]', {
        symbol,
        ymd,
        validCount: validQuotes.length,
        firstRow: validQuotes.length > 0 ? validQuotes[0] : null,
        lastRow: validQuotes.length > 0 ? validQuotes[validQuotes.length - 1] : null,
      });

      if (validQuotes.length === 0) {
        continue;
      }

      const firstWithOpen = validQuotes.find(
        (q) => q.open !== null && q.open !== undefined
      );

      if (!firstWithOpen) {
        continue;
      }

      const last = validQuotes[validQuotes.length - 1];

      const lastClose = Number(last.close);
      const lastOpen = Number(firstWithOpen.open);

      if (!Number.isFinite(lastClose) || !Number.isFinite(lastOpen)) {
        continue;
      }

      let previousClose =
        typeof chart.meta?.previousClose === 'number'
          ? Number(chart.meta.previousClose)
          : typeof chart.meta?.chartPreviousClose === 'number'
            ? Number(chart.meta.chartPreviousClose)
            : null;

      if (!Number.isFinite(previousClose)) {
        previousClose = await findPreviousTradingDayClose(symbol, ymd);
      }

      if (previousClose === null || !Number.isFinite(previousClose)) {
        continue;
      }

      const totalVolume = validQuotes.reduce((sum, q) => {
        return sum + (q.volume ?? 0);
      }, 0);

      const result = {
        price: lastClose,
        change: lastClose - previousClose,
        changePercent:
          previousClose !== 0 ? ((lastClose - previousClose) / previousClose) * 100 : null,
        openDiff: lastClose - lastOpen,
        openDiffPercent:
          lastOpen !== 0 ? ((lastClose - lastOpen) / lastOpen) * 100 : null,
        totalVolume,
        quoteTime: null,
      };

      console.log('[fallback:success]', {
        symbol,
        ymd,
        lastDate: last.date,
        previousClose,
        result,
      });

      return result;
    } catch (e) {
      console.error('[fallback:tryDate:catch]', {
        symbol,
        ymd,
        error: e instanceof Error ? e.message : e,
      });
    }
  }

  throw new Error('直近取引日の1分足確定データ取得失敗');
}

async function fetchIntradayQuote(
  input: string,
  masterRows: StockMasterRow[],
  period1: string,
  period2: string
): Promise<QuoteResult> {
  let code = '';
  let name = '';
  let symbol = '';

  if (/^\d{4}$|^\d{3}[A-Z]$/i.test(input)) {
    code = input.toUpperCase();
    symbol = `${code}.T`;

    const matched = masterRows.find(
      (row) => String(row.code).toUpperCase() === String(code)
    );

    if (matched) {
      name = matched.name;
    } else {
      name = code;
    }
  } else {
    const resolved = resolveStockByName(input);

    if (!resolved) {
      console.error('[intraday:error] 銘柄不明', { input });

      return {
        input,
        code: '-',
        name: '-',
        price: null,
        change: null,
        changePercent: null,
        openDiff: null,
        openDiffPercent: null,
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
      console.error('[intraday:error] 当日1分足データなし', {
        input,
        code,
        name,
        symbol,
        quoteSeriesLength: quoteSeries.length,
      });
      throw new Error('当日1分足データなし');
    }

    const firstWithOpen = validQuotes.find(
      (q) => q.open !== null && q.open !== undefined
    );

    if (!firstWithOpen) {
      console.error('[intraday:error] 始値データなし', {
        input,
        code,
        name,
        symbol,
        validQuotesLength: validQuotes.length,
      });
      throw new Error('始値データなし');
    }

    const last = validQuotes[validQuotes.length - 1];

    const lastClose = Number(last.close);
    const firstOpen = Number(firstWithOpen.open);

    const prevCloseRaw =
      chart.meta?.previousClose ??
      chart.meta?.chartPreviousClose ??
      null;

    if (
      !Number.isFinite(lastClose) ||
      !Number.isFinite(firstOpen) ||
      !Number.isFinite(prevCloseRaw)
    ) {
      console.error('[intraday:error] 数値不正', {
        input,
        code,
        name,
        symbol,
        last,
        firstWithOpen,
        prevCloseRaw,
        lastClose,
        firstOpen,
      });
      throw new Error('数値不正');
    }

    const prevClose = Number(prevCloseRaw);

    const change = lastClose - prevClose;
    const changePercent =
      prevClose !== 0 ? (change / prevClose) * 100 : null;

    const openDiff = lastClose - firstOpen;
    const openDiffPercent =
      firstOpen !== 0 ? (openDiff / firstOpen) * 100 : null;

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
      price: lastClose,
      change,
      changePercent,
      openDiff,
      openDiffPercent,
      totalVolume,
      quoteTime: last.date ?? null,
    };
  } catch (e) {
    console.error('[intraday:catch]', {
      input,
      code: code || input,
      name: name || input,
      symbol: symbol || null,
      error: e instanceof Error ? e.message : e,
    });

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

    const limitedInputs = rawInputs.slice(0, MAX_INPUTS);
    const masterRows = stockMaster as StockMasterRow[];
    const { period1, period2 } = getTodayRangeInJst();

    console.log('[request:start]', {
      inputCount: rawInputs.length,
      limitedCount: limitedInputs.length,
      maxInputs: MAX_INPUTS,
      batchSize: BATCH_SIZE,
      period1,
      period2,
    });

    const inputBatches = chunkArray(limitedInputs, BATCH_SIZE);
    const results: QuoteResult[] = [];

    for (let i = 0; i < inputBatches.length; i += 1) {
      const batch = inputBatches[i];

      console.log('[request:batch:start]', {
        batchIndex: i + 1,
        batchCount: inputBatches.length,
        batchSize: batch.length,
      });

      const batchResults = await Promise.all(
        batch.map((input) =>
          fetchIntradayQuote(input, masterRows, period1, period2)
        )
      );

      results.push(...batchResults);

      console.log('[request:batch:done]', {
        batchIndex: i + 1,
        successCount: batchResults.filter((r) => !r.error).length,
        failedCount: batchResults.filter((r) => !!r.error).length,
      });
    }

    const allFailed = results.every((r) => !!r.error);

    console.log('[request:intradayResult]', {
      allFailed,
      resultCount: results.length,
      failedCount: results.filter((r) => !!r.error).length,
      sample: results.slice(0, 3),
    });

    let finalResults = results;
    let headerNote = '';

    if (allFailed) {
      console.log('[fallback:enter] 全件失敗のため直近取引日の1分足確定データ取得開始');

      const resultBatches = chunkArray(results, BATCH_SIZE);
      const fallbackResults: QuoteResult[] = [];

      for (let i = 0; i < resultBatches.length; i += 1) {
        const batch = resultBatches[i];

        console.log('[fallback:batch:start]', {
          batchIndex: i + 1,
          batchCount: resultBatches.length,
          batchSize: batch.length,
        });

        const batchFallbackResults = await Promise.all(
          batch.map(async (r) => {
            if (!r.code || r.code === '-') {
              console.error('[fallback:skip] code不正', r);
              return r;
            }

            try {
              const confirmed = await fetchConfirmedQuote(`${r.code}.T`);
              return {
                ...r,
                ...confirmed,
                error: undefined,
              };
            } catch (e) {
              console.error('[fallback:catch]', {
                code: r.code,
                name: r.name,
                symbol: `${r.code}.T`,
                error: e instanceof Error ? e.message : e,
              });
              return r;
            }
          })
        );

        fallbackResults.push(...batchFallbackResults);

        console.log('[fallback:batch:done]', {
          batchIndex: i + 1,
          successCount: batchFallbackResults.filter((r) => !r.error).length,
          failedCount: batchFallbackResults.filter((r) => !!r.error).length,
        });
      }

      finalResults = fallbackResults;
      headerNote = '※ 当日データ取得不可のため直近取引日の1分足確定データ';

      console.log('[fallback:done]', {
        successCount: fallbackResults.filter((r) => !r.error).length,
        failedCount: fallbackResults.filter((r) => !!r.error).length,
        sample: fallbackResults.slice(0, 3),
      });
    }

    const now = new Date();
    const fetchedAt = formatTimestamp(now);

    const pasteText =
      `取得時刻: ${fetchedAt}\n` +
      (headerNote ? `\n${headerNote}\n` : '\n') +
      finalResults.map(toPasteLine).join('\n');

    return NextResponse.json({
      fetchedAt,
      results: finalResults,
      pasteText,
    });
  } catch (error) {
    console.error('[request:outerCatch]', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      },
      { status: 500 }
    );
  }
}
