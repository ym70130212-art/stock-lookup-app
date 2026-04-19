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

type QuotesApiResponse = {
  results: QuoteResult[];
  fetchedAt?: string;
  error?: string;
};

const STORAGE_KEY = "stock-app-last-input";
const MAX_ITEMS = 20;

export default function Page() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<QuoteResult[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 初回表示時に前回入力を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setText(saved);
      }
    } catch {
      // localStorageが使えない環境でも落とさない
    }
  }, []);

  // 入力内容を自動保存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // 保存失敗でも画面はそのまま使えるようにする
    }
  }, [text]);

  // 改行ごとに1件として扱う
  const inputs = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }, [text]);

  const count = inputs.length;
  const isOverLimit = count > MAX_ITEMS;

  const handleFetchQuotes = async () => {
    if (count === 0) {
      setError("銘柄コードまたは企業名・略称を入力してください。");
      setResults([]);
      setFetchedAt("");
      return;
    }

    if (isOverLimit) {
      setError(`入力件数が多すぎます。最大${MAX_ITEMS}件までです。`);
      setResults([]);
      setFetchedAt("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // 重要: 配列のまま送る
        body: JSON.stringify({ inputs }),
      });

      const raw = await response.text();

      let data: QuotesApiResponse;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("APIの返り値が不正です。");
      }

      if (!response.ok) {
        throw new Error(data.error || "株価取得に失敗しました。");
      }

      if (!Array.isArray(data.results)) {
        throw new Error("結果データの形式が不正です。");
      }

      setResults(data.results);
      setFetchedAt(data.fetchedAt || "");
    } catch (err) {
      setResults([]);
      setFetchedAt("");
      setError(
        err instanceof Error ? err.message : "不明なエラーが発生しました。"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setText("");
    setResults([]);
    setFetchedAt("");
    setError("");

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 何もしない
    }
  };

  const handleCopyForGpt = async () => {
    if (results.length === 0) return;

    const lines = results.map((row) => {
      const priceText =
        row.price !== null ? `${row.price.toLocaleString()}円` : "-";

      const changeText =
        row.change !== null && row.changePercent !== null
          ? `${row.change > 0 ? "+" : ""}${row.change.toLocaleString()}円 (${row.changePercent > 0 ? "+" : ""}${row.changePercent.toFixed(2)}%)`
          : "-";

      return `${row.code} ${row.name} ${priceText} 前日比${changeText}`;
    });

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      setError("コピーに失敗しました。");
    }
  };

  return (
    <main
      style={{
        maxWidth: 1600,
        margin: "0 auto",
        padding: "16px 14px 28px",
      }}
    >
      <section
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 28,
          padding: 28,
          marginBottom: 26,
        }}
      >
        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            margin: "0 0 18px 0",
            color: "#0f172a",
          }}
        >
          株価一覧アプリ
        </h1>

        <div
          style={{
            color: "#64748b",
            fontSize: 20,
            lineHeight: 1.7,
            marginBottom: 10,
          }}
        >
          1行に1つずつ、銘柄コードまたは企業名・略称を入力してください。
        </div>

        <div
          style={{
            color: "#64748b",
            fontSize: 20,
            lineHeight: 1.7,
            marginBottom: 22,
          }}
        >
          例: NTT / ソニー / 7203
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
          rows={9}
          spellCheck={false}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            border: "2px solid #222",
            borderRadius: 22,
            padding: "18px 20px",
            fontSize: 20,
            lineHeight: 1.45,
            outline: "none",
            marginBottom: 26,
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
          <div
            style={{
              fontSize: 20,
              color: isOverLimit ? "crimson" : "#64748b",
            }}
          >
            入力件数: {count}件（最大{MAX_ITEMS}件）
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: "16px 26px",
                borderRadius: 18,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              クリア
            </button>

            <button
              type="button"
              onClick={handleFetchQuotes}
              disabled={loading}
              style={{
                padding: "16px 26px",
                borderRadius: 18,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontSize: 18,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? "取得中..." : "株価を取得"}
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 18,
              color: "crimson",
              fontSize: 18,
            }}
          >
            {error}
          </div>
        )}
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 28,
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 34,
                fontWeight: 800,
                margin: "0 0 10px 0",
                color: "#0f172a",
              }}
            >
              結果一覧
            </h2>

            <div
              style={{
                fontSize: 18,
                color: "#64748b",
              }}
            >
              取得時刻: {fetchedAt || "-"}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyForGpt}
            disabled={results.length === 0}
            style={{
              padding: "16px 24px",
              borderRadius: 18,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 18,
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
              fontSize: 18,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={thStyle}>入力</th>
                <th style={thStyle}>コード</th>
                <th style={thStyle}>企業名</th>
                <th style={thStyle}>株価</th>
                <th style={thStyle}>前日比</th>
              </tr>
            </thead>

            <tbody>
              {results.length > 0 ? (
                results.map((row, index) => {
                  const priceText =
                    row.price !== null ? `${row.price.toLocaleString()}円` : "-";

                  const changeText =
                    row.change !== null && row.changePercent !== null
                      ? `${row.change > 0 ? "+" : ""}${row.change.toLocaleString()}円 (${row.changePercent > 0 ? "+" : ""}${row.changePercent.toFixed(2)}%)`
                      : "-";

                  return (
                    <tr key={`${row.input}-${index}`} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={tdStyle}>{row.input}</td>
                      <td style={tdStyle}>{row.code || "-"}</td>
                      <td style={tdStyle}>{row.name || "-"}</td>
                      <td style={tdStyle}>{priceText}</td>
                      <td style={tdStyle}>{changeText}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "22px 14px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 14px",
  fontWeight: 800,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "16px 14px",
  color: "#111827",
  verticalAlign: "top",
};
