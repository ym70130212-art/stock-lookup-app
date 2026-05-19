'use client';

import { useEffect, useState } from 'react';

type ApiResponse = {
  pasteText?: string;
  error?: string;
};

const STORAGE_KEY = 'stock-input';
const MAX_INPUTS = 100;

function parseInputLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countOutputStocks(text: string): number {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\d{4}|^\d{3}[A-Z]/i.test(line.trim()))
    .length;
}

export default function Page() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setInput(saved);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, input);
    } catch (e) {
      console.error(e);
    }
  }, [input]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice('');
    }, 2000);
  };

  const handleFetch = async () => {
    const inputs = parseInputLines(input);

    if (inputs.length === 0) {
      setError('入力してください');
      return;
    }

    if (inputs.length > MAX_INPUTS) {
      setError(`銘柄数が上限（${MAX_INPUTS}件）を超えています。${MAX_INPUTS}件以内にしてください。`);
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs,
        }),
      });

      const data: ApiResponse = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || '取得失敗');
      }

      setResult(data.pasteText || '');
    } catch (e) {
      setResult('');
      setError(e instanceof Error ? e.message : '取得エラー');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    const ok = window.confirm('入力内容と結果をすべて削除しますか？');
    if (!ok) return;

    setInput('');
    setResult('');
    setError('');
    setNotice('');

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result);

      const count = countOutputStocks(result);
      if (count > 0) {
        showNotice(`コピーしました（${count}銘柄）`);
      } else {
        showNotice('コピーしました');
      }
    } catch (e) {
      console.error(e);
      setError('コピーに失敗しました');
    }
  };

  const inputCount = parseInputLines(input).length;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>株価一覧アプリ</h1>

      <p style={{ marginBottom: 8 }}>
        1行に1銘柄ずつ、銘柄コードまたは銘柄名を入力してください
      </p>

      <p style={{ marginBottom: 8, color: inputCount > MAX_INPUTS ? 'crimson' : '#555' }}>
        入力銘柄数: {inputCount} / {MAX_INPUTS}
      </p>

      <textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError('');
          setNotice('');
        }}
        rows={10}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          marginBottom: 12,
          padding: 12,
          fontSize: 16,
        }}
        placeholder={`6741\n2484\n4901`}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleFetch} disabled={loading}>
          {loading ? '取得中...' : '取得'}
        </button>

        <button type="button" onClick={handleCopy} disabled={!result}>
          コピー
        </button>

        <button type="button" onClick={handleClear}>
          クリア
        </button>
      </div>

      {notice && (
        <div style={{ color: 'green', marginBottom: 12 }}>
          {notice}
        </div>
      )}

      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <textarea
        value={result}
        readOnly
        rows={16}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: 12,
          fontSize: 16,
        }}
      />
    </main>
  );
}
