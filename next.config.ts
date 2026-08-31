import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Semua halaman HTML + API: jangan di-cache browser/Cloudflare,
        // sehingga build baru langsung tampil tanpa clear cache manual.
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // Aset statis Next tetap di-cache permanen (nama file berubah tiap build).
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
