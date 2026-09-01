import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Semua halaman HTML + API: jangan di-cache browser/Cloudflare,
        // sehingga build baru langsung tampil tanpa clear cache manual.
        // Aset _next/static TIDAK ikut aturan ini — Next sudah otomatis
        // menyajikannya dengan max-age immutable berdasarkan nama file hash.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
