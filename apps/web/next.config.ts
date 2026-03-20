import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const connectSrc = [
  "'self'",
  ...(apiUrl ? [apiUrl] : []),
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
].join(" ");
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://accounts.google.com",
].join(" ");
const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `connect-src ${connectSrc}`,
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `script-src ${scriptSrc}`,
  `frame-src ${frameSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack(config) {
    const fileLoaderRule = config.module.rules.find((rule: { test?: RegExp }) => rule.test?.test?.(".svg")) as
      | { exclude?: RegExp }
      | undefined;

    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/i;
    }

    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });

    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    if (!apiUrl) {
      return [];
    }

    const normalizedApiUrl = apiUrl.replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${normalizedApiUrl}/api/:path*`,
      },
      {
        source: "/auth/:path*",
        destination: `${normalizedApiUrl}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
