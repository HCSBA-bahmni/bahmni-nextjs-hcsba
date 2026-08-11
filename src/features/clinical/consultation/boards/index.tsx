import type { ReactNode } from "react";
import type { ConsultationBoardSlug } from "../types";
import { BacteriologyBoard } from "./BacteriologyBoard";
import { DiagnosisBoard } from "./DiagnosisBoard";
import { DispositionBoard } from "./DispositionBoard";
import { ObservationsBoard } from "./ObservationsBoard";
import { OrdersBoard } from "./OrdersBoard";
import { SummaryBoard } from "./SummaryBoard";
import { TreatmentBoard } from "./TreatmentBoard";

export function ConsultationBoard({ slug }: { slug: ConsultationBoardSlug }): ReactNode {
  if (slug === "observations") return <ObservationsBoard />;
  if (slug === "diagnosis") return <DiagnosisBoard />;
  if (slug === "disposition") return <DispositionBoard />;
  if (slug === "orders") return <OrdersBoard />;
  if (slug === "bacteriology") return <BacteriologyBoard />;
  if (slug === "treatment") return <TreatmentBoard />;
  return <SummaryBoard />;
}
