import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Allow Circles Mini App host to embed NF Society in an iframe
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://miniapps.aboutcircles.com https://*.aboutcircles.com https://circles-dev.gnosis.io https://*.gnosis.io",
          },
          {
            key: "X-Frame-Options",
            value: "ALLOW-FROM https://miniapps.aboutcircles.com",
          },
        ],
      },
    ];
  },
};

// Sentry : only wrap when SENTRY_DSN is set (keeps local dev clean)
export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
      automaticVercelMonitors: false,
    })
  : nextConfig;
