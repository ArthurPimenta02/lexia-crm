import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Voltar a uma tela aberta há menos de 30 s é instantâneo (o app do
    // iPhone troca muito de aba). Gravar alguma coisa limpa esta memória.
    // `static` vale para as abas do app, que vêm pré-carregadas: no máximo 30 s
    // de idade, em vez dos 5 minutos de origem.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
