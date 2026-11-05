/**
 * A curva suave dos leads (desenho v5): uma linha verde com a área por baixo
 * e uma bolha no dia com mais leads. Sem bibliotecas: um caminho SVG.
 */
const L = 360;
const A = 128;

function caminho(p: { x: number; y: number }[]) {
  if (p.length === 1) return `M0 ${p[0].y} L${L} ${p[0].y}`;
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i];
    const b = p[i];
    const c = p[i + 1];
    const e = p[i + 2] ?? c;
    d += ` C${(b.x + (c.x - a.x) / 6).toFixed(1)} ${(b.y + (c.y - a.y) / 6).toFixed(1)} ${(c.x - (e.x - b.x) / 6).toFixed(1)} ${(c.y - (e.y - b.y) / 6).toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

export function Curva({ valores, bolha }: { valores: number[]; bolha: (n: number) => string }) {
  const max = Math.max(1, ...valores);
  const passo = valores.length > 1 ? L / (valores.length - 1) : L;
  const pts = valores.map((v, i) => ({ x: valores.length > 1 ? i * passo : L / 2, y: 22 + (1 - v / max) * (A - 40) }));
  const topo = valores.indexOf(Math.max(...valores));
  const alvo = pts[topo];
  const linha = caminho(pts);
  const esquerda = Math.min(82, Math.max(4, (alvo.x / L) * 100 - 8));

  return (
    <div aria-hidden="true" className="m-grafico">
      <span className="m-bolha" style={{ left: `${esquerda}%`, top: `${Math.max(0, (alvo.y - 26) / A) * 100}%` }}>{bolha(valores[topo])}</span>
      <svg preserveAspectRatio="none" viewBox={`0 0 ${L} ${A}`}>
        <defs>
          <linearGradient id="m-curva-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3ee0a6" stopOpacity=".28" />
            <stop offset="1" stopColor="#3ee0a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${linha} L${L} ${A} L0 ${A} Z`} fill="url(#m-curva-g)" />
        <path d={linha} fill="none" stroke="#3ee0a6" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="m-curva-ponto" style={{ left: `${(alvo.x / L) * 100}%`, top: `${(alvo.y / A) * 100}%` }} />
    </div>
  );
}
