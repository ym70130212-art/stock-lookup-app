'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  // ★ 初回ロード時に復元
  useEffect(() => {
    const saved = localStorage.getItem('stock-input');
    if (saved) {
      setInput(saved);
    }
  }, []);

  // ★ 入力変更で保存
  useEffect(() => {
    localStorage.setItem('stock-input', input);
  }, [input]);

  // ★ 取得処理
  const handleFetch = async () => {
    if (!input.trim()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          inputs: input.split('\n'),
        }),
      });

      const data = await res.json();
      setResult(data.pasteText || '');
    } catch (e) {
      setResult('取得エラー');
    } finally {
      setLoading(false);
    }
  };

  // ★ クリア（確認付き）
  const handleClear = () => {
    const ok = window.confirm('入力内容をすべて削除しますか？');

    if (!ok) return;

    setInput('');
    setResult('');
    localStorage.removeItem('stock-input');
  };

  return (
    <main style={{ padding: 16 }}>
      <h2>株価取得ツール</h2>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={10}
        style={{ width: '100%', marginBottom: 12 }}
        placeholder="銘柄コードを改行で入力（例：6741）"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={handleFetch} disabled={loading}>
          {loading ? '取得中...' : '取得'}
        </button>

        <button onClick={handleClear}>
          クリア
        </button>
      </div>

      <textarea
        value={result}
        readOnly
        rows={15}
        style={{ width: '100%' }}
      />
    </main>
  );
}
