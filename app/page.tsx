"use client";

import { useEffect, useMemo, useState } from "react";

type QuoteResult = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
};

type ApiResponse = {
  results: QuoteResult[];
  fetchedAt: string;
  pasteText: string;
};

const STORAGE_KEY = "stock-app-last-input";

export default function Page() {
  const [text, setText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 前回入力復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setText(saved);
  }, []);

  // 自動保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  const inputs = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [text]);

  const handleFetch = async () => {
    if (inputs.length === 0) {
      setError("入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
      });

      const data: ApiResponse = await res.json();

      if (!res.ok) {
        throw new Error("取得失敗");
      }

      // 👉 ここが今回の核心
      setPasteText(data.pasteText);

    } catch (err) {
      setError("取得エラー");
      setPasteText("");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!pasteText) return;

    try {
      await navigator.clipboard.writeText(pasteText);
    } catch {
      setError("コピー失敗");
    }
  };

  const handleClear = () => {
    setText("");
    setPasteText("");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>株価一覧アプリ</h1>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleFetch}>
          {loading ? "取得中..." : "取得"}
        </button>

        <button onClick={handleCopy}>コピー</button>

        <button onClick={handleClear}>クリア</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* 👉 ChatGPT用出力 */}
      {pasteText && (
        <pre
          style={{
            marginTop: 20,
            background: "#f5f5f5",
            padding: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          {pasteText}
        </pre>
      )}
    </main>
  );
}
