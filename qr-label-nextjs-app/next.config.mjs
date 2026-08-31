/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: 'standalone',
  reactCompiler: true,
  allowedDevOrigins: ['192.168.16.175', 'localhost', '127.0.0.1', '139.224.64.56'],
  // 这些包在构建阶段加载容易出错，改为运行时从 node_modules 加载
  serverExternalPackages: ['ipp'],
};

export default nextConfig;
