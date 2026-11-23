import { Dialog, type DialogProps } from "primereact/dialog";

export function PabellonDialog(props: DialogProps) {
  return <Dialog {...props} pt={{ maximizableButton: { "aria-label": "Ampliar o restaurar ventana de Pabellón" }, ...props.pt }} />;
}
