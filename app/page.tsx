"use client";

import { useEffect, useMemo, useState } from "react";

type QuoteItem = {
  input: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
};

const STORAGE_KEY = "stock-app-last-input";
const MAX_ITEMS = 20;

export default function Page() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");

  // 初回表示時に前回入力を復元
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      setText(saved);
    }
  }, []);

  // 入力が変わるたびに保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  // 改行区切りで入力一覧化
  const lines = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [text]);

  const count = lines.length;
  const isOverLimit = count > MAX_ITEMS;

  const handleFetch = async () => {
    if (count === 0) {
      setResults([]);
      setError("銘柄コードまたは企業名を入力してください。");
      return;
    }

    if (isOverLimit) {
      setResults([]);
      setError(`入力件数が上限を超えています。最大${MAX_ITEMS}件までです。`);
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
        body: JSON.stringify({ inputs: lines }),
      });

      const raw = await res.text();
      let data: any = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error("APIの返り値がJSONではありません。");
      }

      if (!res.ok) {
        throw new Error(data?.error || "株価取得に失敗しました。");
      }

      if (!Array.isArray(data?.results)) {
        throw new Error("APIの返り値形式が不正です。");
      }

      setResults(data.results);
      setFetchedAt(data.fetchedAt || "");
    } catch (err) {
      setResults([]);
      setFetchedAt("");
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setText("");
    setResults([]);
    setError("");
    setFetchedAt("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleCopyForGpt = async () => {
    if (results.length === 0) return;

    const output = results
      .map((r) => {
        const price = r.price != null ? `${r.price.toLocaleString()}円` : "-";
        const change =
          r.change != null && r.changePercent != null
            ? `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}円 (${
                r.changePercent > 0 ? "+" : ""
              }${r.changePercent.toFixed(2)}%)`
            : "-";

        return `${r.code} ${r.name} ${price} 前日比${change}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(output);
  };

  return (
    <main style={{ maxWidth: 1320, margin: "0 auto", padding: 24 }}>
      <section
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 24,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          株価一覧アプリ
        </h1>

        <p style={{ color: "#6b7280", marginBottom: 4 }}>
          1行に1つずつ、銘柄コードまたは企業名・略称を入力してください。
        </p>
        <p style={{ color: "#6b7280", marginBottom: 20 }}>
          例: NTT / ソニー / 7203
        </p>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
          placeholder={`6741\n2484\n4901`}
          rows={8}
          style={{
            width: "100%",
            resize: "vertical",
            border: "2px solid #222",
            borderRadius: 16,
            padding: 16,
            fontSize: 18,
            lineHeight: 1.5,
            boxSizing: "border-box",
            marginBottom: 18,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: isOverLimit ? "crimson" : "#6b7280", fontSize: 16 }}>
            入力件数: {count}件（最大{MAX_ITEMS}件）
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleClear}
              type="button"
              style={{
                padding: "12px 20px",
                borderRadius: 14,
                border: "1px solid #ccc",
                background: "#fff",
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              クリア
            </button>

            <button
              onClick={handleFetch}
              type="button"
              disabled={loading}
              style={{
                padding: "12px 20px",
                borderRadius: 14,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "取得中..." : "株価を取得"}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "crimson", marginTop: 16, fontSize: 16 }}>{error}</p>
        )}
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 24,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>結果一覧</h2>
            {fetchedAt && (
              <div style={{ color: "#6b7280", fontSize: 16 }}>
                取得時刻: {fetchedAt}
              </div>
            )}
          </div>

          <button
            onClick={handleCopyForGpt}
            type="button"
            disabled={results.length === 0}
            style={{
              padding: "12px 18px",
              borderRadius: 14,
              border: "1px solid #ccc",
              background: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: results.length === 0 ? "default" : "pointer",
              opacity: results.length === 0 ? 0.5 : 1,
            }}
          >
            GPT用テキストをコピー
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 16,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <th style={{ textAlign: "left", padding: "14px 12px" }}>入力</th>
                <th style={{ textAlign: "left", padding: "14px 12px" }}>コード</th>
                <th style={{ textAlign: "left", padding: "14px 12px" }}>企業名</th>
                <th style={{ textAlign: "left", padding: "14px 12px" }}>株価</th>
                <th style={{ textAlign: "left", padding: "14px 12px" }}>前日比</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={`${row.code}-${idx}`} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "14px 12px" }}>{row.input}</td>
                  <td style={{ padding: "14px 12px" }}>{row.code}</td>
                  <td style={{ padding: "14px 12px" }}>{row.name}</td>
                  <td style={{ padding: "14px 12px" }}>
                    {row.price != null ? `${row.price.toLocaleString()}円` : "-"}
                  </td>
                  <td style={{ padding: "14px 12px" }}>
                    {row.change != null && row.changePercent != null
                      ? `${row.change > 0 ? "+" : ""}${row.change.toFixed(1)}円 (${
                          row.changePercent > 0 ? "+" : ""
                        }${row.changePercent.toFixed(2)}%)`
                      : "-"}
                  </td>
                </tr>
              ))}

              {results.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "20px 12px", color: "#6b7280", textAlign: "center" }}
                  >
                    まだ結果はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
