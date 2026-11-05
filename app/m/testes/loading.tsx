/** Esqueleto da Área de testes: a navegação abre logo, o chat chega a seguir. */
export default function CarregandoTestes() {
  const cinza = { background: "var(--m-cartao)", borderRadius: 8, display: "block" } as const;
  return (
    <div aria-busy="true" className="m-chat" style={{ zIndex: 55 }}>
      <header className="m-chat-cab">
        <span className="m-redondo" />
        <div className="m-meio">
          <b style={{ ...cinza, height: 16, width: 130 }} />
          <span style={{ ...cinza, height: 12, marginTop: 6, width: 180 }} />
        </div>
        <span className="m-redondo" />
      </header>
      <div className="m-msgs">
        <div className="m-b cli" style={{ background: "var(--m-cartao)", height: 40, width: "62%" }} />
        <div className="m-b eq" style={{ background: "var(--m-cartao)", height: 40, width: "48%" }} />
        <div className="m-b cli" style={{ background: "var(--m-cartao)", height: 64, width: "70%" }} />
      </div>
    </div>
  );
}
