import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://ec2-3-120-177-90.eu-central-1.compute.amazonaws.com/:path*'
            }
        ]
    }
};

export default nextConfig;
