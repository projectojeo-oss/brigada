import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brigada Odontológica - Sistema de Cola",
  description: "Sistema de gestión de pacientes para brigada odontológica",
  charset: "utf-8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
