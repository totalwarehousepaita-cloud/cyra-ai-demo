const LOCATION_STATUSES = ["complete", "partial", "mismatch"];

export function normalizeLocationDecision(finding, faceCode) {
  const c1 = ["R", "L", "F", "D"].includes(faceCode) ? faceCode : "F";
  const out = { ...finding };
  const proposedCode = String(out.cyra_location || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const status = String(out.location_status || "").toLowerCase();
  const confidence = Number(out.location_confidence);

  out.location_status = LOCATION_STATUSES.includes(status) ? status : "partial";
  out.location_confidence = Number.isFinite(confidence)
    ? Math.min(1, Math.max(0, confidence))
    : 0;

  const completePattern = c1 === "D" || c1 === "F"
    ? new RegExp(`^${c1}[HTBGX][1-4][N1-4]$`)
    : new RegExp(`^${c1}[HTBGX][0-9][N0-9]$`);
  const canUseCompleteCode =
    out.location_status === "complete" &&
    out.location_confidence >= 0.65 &&
    completePattern.test(proposedCode);

  const finalCode = canUseCompleteCode ? proposedCode : c1;

  if (!canUseCompleteCode) {
    if (out.location_status === "complete") out.location_status = "partial";
    if (!out.location_reason) {
      out.location_reason = out.location_status === "mismatch"
        ? "La imagen parece corresponder a una cara distinta de la seleccionada."
        : "La imagen no permite identificar con seguridad la altura y sección del contenedor.";
    }
  } else {
    out.location_reason = "";
  }

  out.cyra_location = finalCode;
  out.location = finalCode;
  out.location_code = finalCode;
  out.codigo_ubicacion = finalCode;
  out.cod_cyra = finalCode;

  return out;
}
