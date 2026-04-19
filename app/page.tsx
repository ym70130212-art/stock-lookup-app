"use client";

import { useEffect, useState } from "react";

type QuoteItem = {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
};

const STORAGE_KEY = "stock-app-last-input";

export default function Page() {
  const [input, setInput] = useState("");
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 初回表示時に前回入力を復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setInput(saved);
    }
  }, []);

  // 入力が変わるたびに保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, input);
  }, [input]);

  const handleSearch = async () => {
    const trimmed = input.trim();

    // 検索時だけ未入力エラーを出す
    if (!trimmed) {
      setQuotes([]);
      setError("銘柄コードまたは名称を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/quotes?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "株価取得に失敗しました。");
      }

      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setQuotes([]);
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInput("");
    setQuotes([]);
    setError("");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
        株価一覧アプリ
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="例: 7203 / トヨタ / ソニー"
          style={{
            flex: 1,
            minWidth: 280,
            padding: "10px 12px",
            border: "1px solid #ccc",
            borderRadius: 8,
            fontSize: 16,
          }}
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          {loading ? "取得中..." : "検索"}
        </button>

        <button
          onClick={handleClear}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          クリア
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginBottom: 16 }}>
          {error}
        </p>
      )}

      {quotes.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {quotes.map((item) => (
            <div
              key={item.symbol}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {item.shortName || item.symbol}
              </div>
              <div style={{ color: "#666", marginTop: 4 }}>
                {item.symbol}
              </div>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>
                {item.regularMarketPrice ?? "-"}
              </div>
              <div style={{ marginTop: 4 }}>
                前日比: {item.regularMarketChange ?? "-"} /{" "}
                {item.regularMarketChangePercent ?? "-"}%
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
