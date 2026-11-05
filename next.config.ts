import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Voltar a uma tela aberta há menos de 30 s é instantâneo (o app do
    // iPhone troca muito de aba). Gravar alguma coisa limpa esta memória.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
