'use client';

import { useMemo, useState } from 'react';

type ApiResult = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  symbol: string;
  error?: string;
};

type ApiResponse = {
  fetchedAt: string;
  results: ApiResult[];
  pasteText: string;
  note: string;
  error?: string;
};

const defaultInput = ['NTT', 'ソニー', 'トヨタ'].join('\n');

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}円`;
}

function formatChange(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}`;
}

export default function Page() {
  const [inputs, setInputs] = useState(defaultInput);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const rowCount = useMemo(() => inputs.split(/\r?\n/).filter(Boolean).length, [inputs]);

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setCopied(false);

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });

      const json = (await res.json()) as ApiResponse;

      if (!res.ok) {
        throw new Error(json.error || '取得に失敗しました');
      }

      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!data?.pasteText) return;
    await navigator.clipboard.writeText(data.pasteText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <h1 style={styles.title}>株価一覧アプリ</h1>
        <p style={styles.lead}>
          1行に1つずつ、銘柄コードまたは企業名・略称を入力してください。<br />
          例: NTT / ソニー / 7203
        </p>

        <textarea
          value={inputs}
          onChange={(e) => setInputs(e.target.value)}
          rows={8}
          style={styles.textarea}
          placeholder={'NTT\nソニー\nトヨタ'}
        />

        <div style={styles.metaRow}>
          <span style={styles.metaText}>入力件数: {rowCount}件（最大20件）</span>
          <button onClick={handleSubmit} disabled={loading} style={styles.primaryButton}>
            {loading ? '取得中...' : '株価を取得'}
          </button>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>結果一覧</h2>
            <p style={styles.subtle}>{data ? `取得時刻: ${data.fetchedAt}` : 'まだ取得していません'}</p>
          </div>
          <button onClick={handleCopy} disabled={!data?.pasteText} style={styles.secondaryButton}>
            {copied ? 'コピーしました' : 'GPT用テキストをコピー'}
          </button>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>入力</th>
                <th style={styles.th}>コード</th>
                <th style={styles.th}>企業名</th>
                <th style={styles.th}>株価</th>
                <th style={styles.th}>前日比</th>
              </tr>
            </thead>
            <tbody>
              {data?.results?.length ? (
                data.results.map((row, index) => (
                  <tr key={`${row.input}-${index}`}>
                    <td style={styles.td}>{row.input}</td>
                    <td style={styles.td}>{row.code}</td>
                    <td style={styles.td}>{row.name}</td>
                    <td style={styles.td}>{row.error ? '-' : formatCurrency(row.price)}</td>
                    <td style={styles.td}>
                      {row.error ? row.error : `${formatChange(row.change)}円 (${formatChange(row.changePercent, 2)}%)`}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={styles.td} colSpan={5}>
                    ここに結果が表示されます。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 style={styles.outputTitle}>GPTに貼る用テキスト</h3>
        <textarea readOnly value={data?.pasteText ?? ''} rows={8} style={styles.outputArea} />

        {data?.note ? <p style={styles.note}>{data.note}</p> : null}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: '16px',
    display: 'grid',
    gap: '16px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  card: {
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.04)',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '28px',
  },
  lead: {
    margin: '0 0 16px 0',
    color: '#4b5563',
    lineHeight: 1.6,
  },
  textarea: {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    padding: '12px',
    resize: 'vertical',
    minHeight: '180px',
  },
  outputArea: {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    padding: '12px',
    resize: 'vertical',
    background: '#f9fafb',
  },
  metaRow: {
    marginTop: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    color: '#6b7280',
  },
  primaryButton: {
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  secondaryButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    padding: '10px 14px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  errorBox: {
    marginTop: '12px',
    background: '#fff1f2',
    color: '#be123c',
    borderRadius: '12px',
    padding: '12px',
  },
  sectionHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '22px',
  },
  subtle: {
    margin: '4px 0 0 0',
    color: '#6b7280',
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '720px',
  },
  th: {
    textAlign: 'left',
    background: '#f9fafb',
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    verticalAlign: 'top',
  },
  outputTitle: {
    marginTop: '18px',
    marginBottom: '8px',
    fontSize: '18px',
  },
  note: {
    marginTop: '12px',
    color: '#6b7280',
    lineHeight: 1.6,
    fontSize: '14px',
  },
};
