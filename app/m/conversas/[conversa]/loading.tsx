/** Esqueleto do chat: o cabeçalho e algumas bolhas, enquanto as mensagens chegam. */
export default function CarregandoChat() {
  return (
    <div aria-busy="true" className="m-chat">
      <header className="m-chat-cab">
        <span className="m-redondo" />
        <span className="m-esq" style={{ borderRadius: 19, height: 38, width: 38 }} />
        <div className="m-meio">
          <span className="m-esq" style={{ borderRadius: 7, display: "block", height: 14, width: 130 }} />
          <span className="m-esq" style={{ borderRadius: 6, display: "block", height: 11, marginTop: 6, width: 90 }} />
        </div>
      </header>
      <div className="m-msgs">
        <div className="m-b cli m-esq" style={{ height: 40, width: "62%" }} />
        <div className="m-b eq m-esq" style={{ height: 40, width: "48%" }} />
        <div className="m-b cli m-esq" style={{ height: 64, width: "70%" }} />
        <div className="m-b eq m-esq" style={{ height: 40, width: "40%" }} />
      </div>
    </div>
  );
}
