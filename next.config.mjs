/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/skills/quotadex-buyer/SKILL.md": ["./skills/quotadex-buyer/SKILL.md"],
    "/skills/quotadex-seller/SKILL.md": ["./skills/quotadex-seller/SKILL.md"]
  },
  reactStrictMode: true
};

export default nextConfig;
