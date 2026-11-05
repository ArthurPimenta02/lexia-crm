import { Mascote, type PoseMascote } from "@/app/components/mascote";

/** Tela vazia do app com o beija-flor por cima do texto (não usar em erros). */
export function VazioMascote({ children, pose = "ola" }: { children: React.ReactNode; pose?: PoseMascote }) {
  return (
    <div className="m-vazio m-vazio-mascote">
      <Mascote pose={pose} tamanho={88} />
      <span>{children}</span>
    </div>
  );
}
