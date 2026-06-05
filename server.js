/* === CYRA FINAL DOOR LOCATION CODING BY DOCUMENT === */
function forceDoorLocationByDocument(finding, body) {
  if (!finding || typeof finding !== "object") return finding;

  const requestText = [
    body?.face,
    body?.faceName,
    body?.side,
    body?.view,
    body?.cara,
    body?.section,
    body?.component
  ]
    .join(" ")
    .toLowerCase();

  const findingText = [
    finding.face,
    finding.faceName,
    finding.cara,
    finding.description,
    finding.descripcion,
    finding.damage_code,
    finding.cyra_location,
    finding.location,
    finding.component_code,
    finding.component_name,
    finding.component_label,
    finding.repair_method,
    finding.repair_method_name
  ]
    .join(" ")
    .toLowerCase();

  const isDoor =
    requestText.includes("puerta") ||
    requestText.includes("door") ||
    requestText.includes("roof") ||
    findingText.includes("puerta") ||
    findingText.includes("door");

  if (!isDoor) return finding;

  const txt = findingText;

  let second = "X";
  let third = "2";
  let fourth = "N";

  /*
    DOCUMENTO:
    1er carácter Puertas = D
    2do carácter para lados/frontal/puertas:
      T = mitad superior
      B = mitad inferior
      H = partes estructurales altas
      G = partes estructurales bajas
      X = cruza / general
    3er carácter para frontal y puertas:
      1 = poste izquierdo
      2 = puerta izquierda
      3 = puerta derecha
      4 = poste derecho
    4to carácter:
      N = ubicación específica
      1-4 = si abarca varias secciones en puertas/frontal
  */

  // 2do carácter: zona vertical / estructural
  if (
    txt.includes("superior") ||
    txt.includes("arriba") ||
    txt.includes("top") ||
    txt.includes("header") ||
    txt.includes("cabezal superior") ||
    txt.includes("refuerzo superior")
  ) {
    second = "T";
  } else if (
    txt.includes("inferior") ||
    txt.includes("abajo") ||
    txt.includes("bottom") ||
    txt.includes("zocalo") ||
    txt.includes("zócalo") ||
    txt.includes("refuerzo inferior")
  ) {
    second = "B";
  } else if (
    txt.includes("poste") ||
    txt.includes("corner post") ||
    txt.includes("bisagra superior") ||
    txt.includes("estructura alta") ||
    txt.includes("marco superior")
  ) {
    second = "H";
  } else if (
    txt.includes("estructura baja") ||
    txt.includes("marco inferior") ||
    txt.includes("zocalo inferior") ||
    txt.includes("zócalo inferior")
  ) {
    second = "G";
  } else if (
    txt.includes("ambas puertas") ||
    txt.includes("ambas hojas") ||
    txt.includes("generalizada") ||
    txt.includes("toda la puerta") ||
    txt.includes("toda la superficie") ||
    txt.includes("superficie total") ||
    txt.includes("completa")
  ) {
    second = "X";
  } else {
    second = "X";
  }

  // 3er carácter: seccionamiento de puerta
  if (
    txt.includes("poste izquierdo") ||
    txt.includes("left post") ||
    txt.includes("corner izquierdo")
  ) {
    third = "1";
  } else if (
    txt.includes("puerta izquierda") ||
    txt.includes("hoja izquierda") ||
    txt.includes("panel izquierdo") ||
    txt.includes("left door") ||
    txt.includes("izquierda")
  ) {
    third = "2";
  } else if (
    txt.includes("puerta derecha") ||
    txt.includes("hoja derecha") ||
    txt.includes("panel derecho") ||
    txt.includes("right door") ||
    txt.includes("derecha")
  ) {
    third = "3";
  } else if (
    txt.includes("poste derecho") ||
    txt.includes("right post") ||
    txt.includes("corner derecho")
  ) {
    third = "4";
  } else if (
    txt.includes("ambas puertas") ||
    txt.includes("ambas hojas") ||
    txt.includes("generalizada") ||
    txt.includes("toda la puerta") ||
    txt.includes("toda la superficie") ||
    txt.includes("completa")
  ) {
    third = "X";
  } else {
    // Si no se sabe la hoja exacta, usar zona general de panel de puerta
    third = "X";
  }

  // 4to carácter: N puntual o rango si abarca varias zonas
  if (
    txt.includes("ambas puertas") ||
    txt.includes("ambas hojas") ||
    txt.includes("generalizada") ||
    txt.includes("toda la puerta") ||
    txt.includes("toda la superficie") ||
    txt.includes("completa") ||
    txt.includes("extensa") ||
    txt.includes("longitudinal")
  ) {
    if (third === "X") {
      fourth = "23";
    } else {
      fourth = "N";
    }
  } else {
    fourth = "N";
  }

  let locationCode = `D${second}${third}${fourth}`;

  // Limpieza de casos raros
  locationCode = locationCode
    .replace("DXX23", "DX23")
    .replace("DXXN", "DXXX");

  // Si quedó demasiado genérico, usar una ubicación válida de puerta
  if (!/^D[A-Z0-9]{3,4}$/.test(locationCode)) {
    locationCode = "DX2N";
  }

  // Componentes según documento
  let componentCode = finding.component_code || "-";
  let componentName = finding.component_name || "-";

  if (
    txt.includes("bisagra") ||
    txt.includes("hinge")
  ) {
    componentCode = "HGA";
    componentName = "Bisagra completa";
    locationCode = locationCode === "DXXX" ? "DX2N" : locationCode;
  } else if (
    txt.includes("barra") ||
    txt.includes("cierre") ||
    txt.includes("locking")
  ) {
    componentCode = "LBR";
    componentName = "Barra de puerta";
    locationCode = locationCode === "DXXX" ? "DX2N" : locationCode;
  } else if (
    txt.includes("cerradura")
  ) {
    componentCode = "DHL";
    componentName = "Ensamble de cerradura de puerta";
    locationCode = locationCode === "DXXX" ? "DB2N" : locationCode;
  } else if (
    txt.includes("manija") ||
    txt.includes("handle")
  ) {
    componentCode = "LBH";
    componentName = "Manija de puerta";
    locationCode = locationCode === "DXXX" ? "DB2N" : locationCode;
  } else if (
    txt.includes("friza") ||
    txt.includes("empaque") ||
    txt.includes("sello") ||
    txt.includes("gasket")
  ) {
    componentCode = "GTA";
    componentName = "Friza de puerta";
    locationCode = locationCode === "DXXX" ? "DXXX" : locationCode;
  } else if (
    txt.includes("refuerzo superior")
  ) {
    componentCode = "DST";
    componentName = "Refuerzo de puerta superior";
    locationCode = locationCode.startsWith("DT") ? locationCode : "DT2N";
  } else if (
    txt.includes("refuerzo inferior")
  ) {
    componentCode = "DSB";
    componentName = "Refuerzo de puerta inferior";
    locationCode = locationCode.startsWith("DB") ? locationCode : "DB2N";
  } else if (
    txt.includes("borde central") ||
    txt.includes("centerline")
  ) {
    componentCode = "DSC";
    componentName = "Refuerzo del borde central de puerta";
    locationCode = "DX23";
  } else if (
    txt.includes("panel") ||
    txt.includes("corrosión") ||
    txt.includes("corrosion") ||
    txt.includes("abolladura") ||
    txt.includes("suciedad") ||
    txt.includes("marca") ||
    txt.includes("sticker") ||
    txt.includes("pintura")
  ) {
    componentCode = "DPL";
    componentName = "Panel de puerta";

    if (locationCode === "DXXX") {
      locationCode = "DX2N";
    }
  }

  finding.faceName = "Puerta";
  finding.face = "Puerta";
  finding.cara = "Puerta";
  finding.cyra_location = locationCode;
  finding.location = locationCode;
  finding.component_code = componentCode;
  finding.component_name = componentName;
  finding.component_label = `${componentCode} - ${componentName}`;

  return finding;
}
