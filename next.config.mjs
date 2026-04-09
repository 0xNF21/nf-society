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

export default nextConfig;
