/** @type {import('next').NextConfig} */
const nextConfig = {
  // Repo predates strict typescript-eslint; `next build` still type-checks via `tsc`.
  eslint: {
    ignoreDuringBuilds: true
  },
  // Keep Electron agents, scripts, and docs out of Vercel Function bundles.
  // Those paths are not needed at runtime on Vercel and inflate Functions Storage.
  experimental: {
    outputFileTracingExcludes: {
      '*': [
        'agent/**/*',
        'harvest-agent/**/*',
        'scripts/**/*',
        'dumps/**/*',
        'tools/**/*',
        'docs/**/*'
      ]
    }
  },
  async redirects() {
    return [
      { source: '/overseer', destination: '/insights/deposit-debit-scans', permanent: false },
      { source: '/overseer/deposit-debit-scans', destination: '/insights/deposit-debit-scans', permanent: false },
      { source: '/overseer/:path*', destination: '/insights/:path*', permanent: false }
    ]
  },
  async rewrites() {
    return [
      // ZKTeco firmware often uses .aspx paths
      { source: '/iclock/cdata.aspx', destination: '/iclock/cdata' },
      { source: '/iclock/getrequest.aspx', destination: '/iclock/getrequest' }
    ]
  }
}

module.exports = nextConfig

