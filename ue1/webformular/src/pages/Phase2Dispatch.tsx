// Phase-2-Dispatcher: lädt das passende FB-Sub-Form basierend auf state.foerderbereich.

import { Navigate, useNavigate } from "react-router-dom";
import { useAntrag } from "../state/AntragContext";
import { Progress } from "../components/Progress";
import { Phase2FBI } from "./Phase2FBI";
import { Phase2FBII } from "./Phase2FBII";
import { Phase2FBIII } from "./Phase2FBIII";
import { Phase2FBIV } from "./Phase2FBIV";

export function Phase2Dispatch(): JSX.Element {
  const { state } = useAntrag();
  const navigate = useNavigate();

  if (!state.foerderbereich) return <Navigate to="/" replace />;

  const onWeiter = () => navigate("/antrag/phase-3");
  const onZurueck = () => navigate("/antrag/phase-1");

  return (
    <>
      <Progress step={2} total={3} />
      <div className="form-wrap">
        {state.foerderbereich === "I" && <Phase2FBI onWeiter={onWeiter} onZurueck={onZurueck} />}
        {state.foerderbereich === "II" && <Phase2FBII onWeiter={onWeiter} onZurueck={onZurueck} />}
        {state.foerderbereich === "III" && <Phase2FBIII onWeiter={onWeiter} onZurueck={onZurueck} />}
        {state.foerderbereich === "IV" && <Phase2FBIV onWeiter={onWeiter} onZurueck={onZurueck} />}
      </div>
    </>
  );
}
