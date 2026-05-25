// Bestätigungsseite mit Antragsnummer.

import { Link, useParams } from "react-router-dom";
import { t } from "../lib/i18n";

export function Danke(): JSX.Element {
  const { antragsnummer } = useParams<{ antragsnummer: string }>();
  return (
    <div className="danke-box">
      <h1>{t("danke.titel")}</h1>
      <p>{t("danke.nummer_label")}</p>
      <div className="antragsnummer">{antragsnummer ?? "—"}</div>
      <p style={{ fontSize: ".9rem", color: "var(--wuerzburg-muted)" }}>{t("danke.hinweis")}</p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: "1rem" }}>
        {t("danke.zurueck")}
      </Link>
    </div>
  );
}
