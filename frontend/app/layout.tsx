import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARB — Tournament Control System",
  description: "Elite robotics tournament management platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-void text-text-primary font-body antialiased">{children}</body>
    </html>
  );
}
