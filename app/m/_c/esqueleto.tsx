/**
 * O que aparece no instante do toque, enquanto os dados chegam: a forma da
 * tela em cinzento a pulsar. Sem texto, sem dados: só as caixas no sítio certo,
 * para nada saltar quando a tela verdadeira entra.
 */
const C = ({ a, l, r = 12, mt = 0 }: { a: number; l?: number | string; r?: number; mt?: number }) => (
  <div className="m-esq" style={{ borderRadius: r, height: a, marginTop: mt, width: l ?? "100%" }} />
);

const Linhas = ({ n }: { n: number }) => (
  <div style={{ marginTop: 14 }}>
    {Array.from({ length: n }, (_, i) => (
      <div className="m-esq-linha" key={i}>
        <C a={38} l={38} r={19} />
        <div style={{ flex: 1 }}><C a={12} l="55%" r={6} /><C a={10} l="80%" mt={8} r={5} /></div>
      </div>
    ))}
  </div>
);

export function Esqueleto({ tipo }: { tipo: "hoje" | "lista" | "numeros" | "grade" | "ajustes" | "agenda" }) {
  return (
    <main aria-busy="true" className="m-pagina">
      {tipo === "hoje" ? (
        <>
          <div className="m-esq-linha" style={{ padding: "2px 0 16px" }}><C a={36} l={36} r={18} /><C a={14} l="40%" r={7} /></div>
          <C a={40} l={120} r={10} />
          <C a={6} mt={14} r={3} />
          <div style={{ display: "flex", gap: 6, margin: "16px 0 22px" }}><C a={36} l={96} r={18} /><C a={36} l={116} r={18} /><C a={36} l={90} r={18} /></div>
          <div style={{ display: "flex", gap: 12 }}>{[0, 1, 2, 3].map((i) => <C a={42} key={i} l={42} r={21} />)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 26 }}><C a={104} l={230} r={20} /><C a={104} l={110} r={20} /></div>
        </>
      ) : tipo === "lista" ? (
        <><C a={30} l={150} r={8} /><C a={40} mt={14} r={20} /><div style={{ display: "flex", gap: 6, marginTop: 12 }}>{[64, 84, 72, 70].map((l, i) => <C a={32} key={i} l={l} r={16} />)}</div><Linhas n={8} /></>
      ) : tipo === "numeros" ? (
        <><C a={30} l={150} r={8} /><div style={{ display: "flex", gap: 6, marginTop: 14 }}>{[56, 60, 70, 52, 100].map((l, i) => <C a={32} key={i} l={l} r={16} />)}</div><C a={12} l={110} mt={20} r={6} /><C a={40} l={180} mt={8} r={10} /><C a={128} mt={14} r={16} /><div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 16 }}><C a={84} r={18} /><C a={84} r={18} /></div></>
      ) : tipo === "grade" ? (
        <><C a={30} l={90} r={8} /><div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 14 }}><C a={84} r={18} /><C a={84} r={18} /></div><div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, 1fr)", marginTop: 8 }}>{[0, 1, 2, 3].map((i) => <C a={64} key={i} r={18} />)}</div><C a={14} l={140} mt={26} r={7} /><C a={40} mt={12} r={12} /><C a={10} mt={30} r={5} /></>
      ) : tipo === "agenda" ? (
        <><C a={30} l={120} r={8} /><C a={40} mt={14} r={20} /><div style={{ display: "flex", gap: 6, marginTop: 14 }}>{[0, 1, 2, 3, 4, 5, 6].map((i) => <C a={58} key={i} r={16} />)}</div>{[0, 1, 2, 3].map((i) => <C a={64} key={i} mt={12} r={16} />)}</>
      ) : (
        <><div className="m-esq-linha"><C a={38} l={38} r={19} /><C a={16} l={90} r={8} /></div><C a={72} mt={16} r={20} /><C a={12} l={90} mt={22} r={6} /><C a={46} mt={8} r={18} /><C a={12} l={90} mt={22} r={6} /><C a={150} mt={8} r={18} /></>
      )}
    </main>
  );
}
