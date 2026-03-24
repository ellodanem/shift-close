/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // ZKTeco firmware often uses .aspx paths
      { source: '/iclock/cdata.aspx', destination: '/iclock/cdata' },
      { source: '/iclock/getrequest.aspx', destination: '/iclock/getrequest' }
    ]
  }
}

module.exports = nextConfig

