import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '株価一覧アプリ',
  description: '企業名や銘柄コードから日本株の株価を一覧表示し、GPTに貼り付けやすい形式でコピーできるアプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
