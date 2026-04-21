'use client';

import { useEffect, useState } from 'react';

type ApiResponse = {
  pasteText?: string;
  error?: string;
};

const STORAGE_KEY = 'stock-input';

export default function Page() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 前回入力の復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setInput(saved);
      }
    } catch {
      // 何もしない
    }
  }, []);

  // 入力の自動保存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, input);
    } catch {
      // 何もしない
    }
  }, [input]);

  const handleFetch = async () => {
    if (!input.trim()) {
      setError('入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: input
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
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

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 何もしない
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result);
    } catch {
      setError('コピーに失敗しました');
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>株価一覧アプリ</h1>

      <p style={{ marginBottom: 8 }}>
        1行に1銘柄ずつ、銘柄コードを入力してください
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
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
