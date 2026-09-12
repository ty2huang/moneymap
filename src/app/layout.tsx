import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyMap · Your household, in perspective",
  description: "A shared view of your spending, cashflow, and reimbursements.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
