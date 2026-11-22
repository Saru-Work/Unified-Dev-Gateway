import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const sans = Instrument_Sans({ variable: "--font-sans-ui", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif-ui", subsets: ["latin"], weight: "400" });
const mono = JetBrains_Mono({ variable: "--font-mono-ui", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OpenGate",
  description: "Browse APIs and manage your applications on WSO2 API Manager.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
