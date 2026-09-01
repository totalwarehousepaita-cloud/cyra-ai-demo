import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { normalizeLocationDecision } from "./location.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "35mb" }));
app.use(express.static(process.cwd()));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/cyra_demo2_real_ai.html");
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

const DAMAGE_CODES = [
  "BR","BT","BW","CO","CT","CU","DB","DL","DT","DY","FZ","GD","HO",
  "IR","LK","LO","ML","MS","NI","NL","OL","OR","OS","WN","WT",
  "BN","CK","PH","OF"
];

const REPAIR_METHODS_TEXT = [
  "Soldadura",
  "Parche estructural",
  "Reemplazo de panel",
  "Enderezado",
  "Tratamiento anticorrosivo",
  "Pintura/retoque",
  "Limpieza",
  "No requiere reparación"
];

const REPAIR_METHOD_CODES = [
  "CC","FR","FT","GS","GT","GW","IT","MD","MV","PA","PL","PR","PT",
  "PX","RA","RD","RE","RM","RP","RR","RX","SE","SN","WD","SW","WW",
  "AB","IN","SC","PS"
];

function buildPrompt(body) {
  return `
Eres un inspector certificado IICL especializado en inspección visual de contenedores marítimos secos y reefer.

CONTEXTO DE INSPECCIÓN:
- ID inspección: ${body.inspection_id || ""}
- Contenedor: ${body.container_id || ""}
- Tipo: ${body.container_type || ""}
- Operación: ${body.operation || ""}
- Depósito: ${body.depot || ""}
- Cara evaluada: ${body.face_name || body.face_id || body.face || body.side || ""}

TAREA:
Analiza la imagen y devuelve resultados reales observables. No inventes daños. Si no hay daños visibles, devuelve findings vacío.

VALIDACIÓN DE IMAGEN:
Si la imagen NO muestra una superficie real de contenedor marítimo, devuelve exactamente:
{
  "invalid": true,
  "reason": "explica brevemente qué muestra la imagen"
}

LECTURA DEL CONTENEDOR:
- Intenta leer el código ISO 6346 visible en la imagen.
- Formato: 4 letras + 7 números. Ejemplo: MSKU0841501.
- Puede estar vertical u horizontal.
- Si lo lees, devuelve "container_id_detected" a nivel principal.
- Si no lo lees, devuelve "container_id_detected": "".
- No inventes códigos.

CRITERIO DE UBICACIÓN CYRA:
Evalúa la ubicación por separado de la detección del daño. Puedes reconocer un
daño con alta confianza y, al mismo tiempo, no tener contexto suficiente para
ubicarlo dentro de la cara completa del contenedor.

Devuelve "location_status" para cada hallazgo:
- "complete": se observan referencias suficientes para identificar altura y sección.
- "partial": el daño es visible, pero la foto es cerrada y no permite identificar altura o sección.
- "mismatch": la imagen muestra claramente una cara distinta a la cara evaluada.

Solo cuando location_status sea "complete", cyra_location debe tener exactamente
4 caracteres. Si es "partial" o "mismatch", devuelve cyra_location con la única
letra de la cara evaluada (R, L, F o D). Nunca deduzcas altura o sección usando
solamente la posición del daño dentro de una foto cerrada.

Devuelve también:
- "location_confidence": confianza de 0 a 1 exclusivamente sobre la ubicación.
- "location_reason": explicación breve cuando la ubicación sea parcial o incompatible.

REFERENCIAS SUFICIENTES PARA UN CÓDIGO COMPLETO:
- Laterales: deben permitir reconocer la altura y la sección longitudinal mediante
  bordes, postes, rieles o una cantidad suficiente de paneles corrugados.
- Frontal y puerta: deben permitir reconocer altura y panel/poste mediante bordes,
  postes, hojas, rieles o estructura visible.
- Un acercamiento que solo muestra el daño y unas pocas corrugaciones no es suficiente.

Para esta demo usa únicamente estas caras como 1er carácter:
L = lateral izquierdo
R = lateral derecho
D = puerta
F = frontal

No uses B, T, U, X, I ni E como primer carácter en esta demo.

2do carácter para lateral izquierdo, lateral derecho, frontal y puertas:
H = partes estructurales altas
T = mitad superior
B = mitad inferior
G = partes estructurales bajas
X = cruza ambas mitades o daño general

3er carácter:
Para frontal y puertas:
1 = poste izquierdo
2 = puerta/frontal izquierdo
3 = puerta/frontal derecho
4 = poste derecho

Para laterales:
Usa secciones longitudinales 1,2,3,4,5,6,7,8,9,0. La décima sección se representa con 0.

4to carácter:
N = daño puntual o en una sola sección.
Si ocupa varias secciones continuas, usa la sección final.

Ejemplos válidos para puerta:
DT2N = mitad superior de puerta izquierda
DT3N = mitad superior de puerta derecha
DB2N = mitad inferior de puerta izquierda
DB3N = mitad inferior de puerta derecha
DX23 = daño que cruza ambas hojas de puerta
DH14 = estructura alta que cruza de poste izquierdo a poste derecho
DG23 = estructura baja/zócalo que cruza ambas hojas

Ejemplos válidos para lateral derecho:
RT5N = lateral derecho, mitad superior, sección 5, puntual
RB67 = lateral derecho, mitad inferior, de sección 6 a 7

Ejemplos válidos para lateral izquierdo:
LT1N = lateral izquierdo, mitad superior, sección 1, puntual
LB20 = lateral izquierdo, mitad inferior, de sección 2 a 10

Ejemplos válidos para frontal:
FT2N = frontal superior izquierdo
FB3N = frontal inferior derecho
FX23 = frontal general entre panel izquierdo y derecho

REGLAS OBLIGATORIAS:
- Nunca devuelvas códigos de 5 caracteres.
- Si la cara evaluada es Puerta, el código debe iniciar con D.
- Si la cara evaluada es Frontal, el código debe iniciar con F.
- Si la cara evaluada es Lateral Izq., el código debe iniciar con L.
- Si la cara evaluada es Lateral Derecho, el código debe iniciar con R.
- Nunca uses TL, TR, TB, TG, UL, UR, BL, BR, IXXX, EXXX ni X como primer carácter en esta demo.

CÓDIGOS DE DAÑO PERMITIDOS:
BR=Fractura
BT=Doblado
BW=Arqueado
CO=Corrosión
CT=Contaminación
CU=Corte
DB=Escombros
DL=Delaminación
DT=Abolladura
DY=Sucio
FZ=Trabado
GD=Rasguño
HO=Agujero
IR=Reparación impropia
LK=Pase de luz
LO=Suelto
ML=Marcas
MS=Faltante
NI=Fuera de dimensión
NL=Clavos
OL=Aceite
OR=Mal olor
OS=Manchas de aceite
WN=Material inadecuado
WT=Desgaste normal
BN=Quemado
CK=Agrietado
PH=Pin holes
OF=Fuera ISO

COMPONENTES PRINCIPALES:
Para puertas:
DPL=Panel/tope de puerta
GTA=Friza de puerta
GRS=Platina de friza
HGA=Bisagra completa
HGB=Ala de bisagra
HGP=Pin de bisagra
LBR=Barra de puerta
LBH=Manija de puerta
LBB=Soporte de barra
LBC=Uñas de puerta
LBG=Guía de barra
DHL=Cerradura de puerta
DHC=Aldaba giratoria
DHR=Retenedor
DST=Refuerzo de puerta superior
DSB=Refuerzo de puerta inferior
DSC=Refuerzo del borde central de puerta
DSH=Refuerzo del borde lateral de bisagra
DFA=Marco de puerta
RCK=Leva fija de puerta

Para laterales y frontal:
PAA=Panel corrugado
POC=Panel exterior
PIC=Panel interior
RLA=Rieles longitudinales/transversales
RLG=Escuadra de refuerzo en rieles
CPO=Pieza exterior de poste esquinero
CPA=Postes
CPL=Platina soldada al poste
MOL=Logotipo del dueño
MSD=Número o letra de serie
MSN=Número de serie/check digit
MST=Marcas de tamaño y tipo
ML/MRU=Marcas varias

MÉTODOS DE REPARACIÓN:
CC=Lavado químico
FR=Destrabar
FT=Reinstalar
GS=Enderezar
GT=Remover goma/cinta
GW=Enderezar y soldar
IT=Insertar
MD=Modificación
MV=Remover etiquetas/marcas
PA=Pintar
PL=Pulido
PR=Remover corrosión localizada y repintar
PT=Parchar
PX=Parchar con foam
RA=Realinear
RD=Remover escombros
RE=Reasegurar
RM=Remover
RP=Reemplazar
RR=Remover y reinstalar
RX=Reemplazar panel y aislamiento
SE=Sellar
SN=Seccionar
WD=Soldar
SW=Barrido
WW=Lavado con agua
AB=Limpieza abrasiva
IN=Instalar
SC=Limpieza con vapor
PS=Preparar superficie y pintar

FORMATO OBLIGATORIO:
Devuelve únicamente JSON válido. No uses markdown, no expliques fuera del JSON.

Si la imagen es válida:
{
  "invalid": false,
  "container_id_detected": "",
  "findings": [
    {
      "damage_code": "DT",
      "description": "descripción técnica del daño visible",
      "cyra_location": "DT2N",
      "location_status": "complete|partial|mismatch",
      "location_confidence": 0.90,
      "location_reason": "vacío si es completa; explicación breve si no",
      "location_detail": "ubicación legible",
      "component_code": "DPL",
      "component_name": "Panel/tope de puerta",
      "repair_method_code": "GS",
      "bbox_x": 0.30,
      "bbox_y": 0.20,
      "bbox_w": 0.18,
      "bbox_h": 0.22,
      "severity": "low|medium|high|critical",
      "dimensions_mm": "largo x ancho estimado",
      "repair_method": "Enderezado",
      "observations": "notas técnicas",
      "confidence": 0.90,
      "container_id_detected": "CONTENEDOR_VISIBLE"
    }
  ]
}

Reglas finales:
- bbox_x, bbox_y, bbox_w y bbox_h deben estar entre 0 y 1 respecto al tamaño de la imagen.
- Usa solo códigos de daño permitidos.
- Usa 4 caracteres solo si location_status es complete; en otro caso usa solo R, L, F o D.
- No completes una ubicación basándote solo en bbox o en la posición dentro de la foto.
- Usa componente relacionado con la cara y ubicación.
- Usa método de reparación coherente con el daño.
- No clasifiques sombras/reflejos como daño.
- Si hay duda razonable, baja confidence y explica en observations.
- Si no hay daños visibles: {"invalid": false, "findings": []}
`;
}

function extractText(content) {
  return content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n");
}

function parseJsonLoose(text) {
  const clean = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch (_) {
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);

    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) return { invalid: false, findings: JSON.parse(arrayMatch[0]) };

    throw new Error("La IA no devolvió JSON válido.");
  }
}

function normalizeContainerId(value) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  return /^[A-Z]{4}\d{7}$/.test(clean) ? clean : "";
}

function getContainerFromText(text) {
  const match = String(text || "")
    .toUpperCase()
    .match(/\b[A-Z]{4}\s?\d{6}\s?\d\b/);

  return match ? normalizeContainerId(match[0]) : "";
}

function clamp01(value, fallback = 0.1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function getRequestFace(body = {}) {
  const faceId = String(body.face_id || body.face || body.side || "").toLowerCase();
  const faceName = String(body.face_name || body.faceName || body.cara || "").toLowerCase();

  if (faceId === "roof" || faceId === "door" || faceName.includes("puerta")) return "D";
  if (faceId === "front" || faceName.includes("frontal") || faceName.includes("front")) return "F";
  if (faceId === "left" || faceName.includes("izq") || faceName.includes("left")) return "L";
  if (faceId === "right" || faceName.includes("dere") || faceName.includes("right")) return "R";

  return "";
}

function getFaceCode(faceText = "", body = {}) {
  const requestFace = getRequestFace(body);
  if (requestFace) return requestFace;

  const s = String(faceText || "").toLowerCase();

  if (s.includes("puerta") || s.includes("door") || s.includes("roof")) return "D";
  if (s.includes("frontal") || s.includes("front")) return "F";
  if (s.includes("izq") || s.includes("left")) return "L";
  if (s.includes("dere") || s.includes("right")) return "R";

  return "F";
}

function normalizeRepairText(value) {
  const txt = String(value || "").toLowerCase();

  if (txt.includes("enderez")) return "Enderezado";
  if (txt.includes("sold")) return "Soldadura";
  if (txt.includes("parch")) return "Parche estructural";
  if (txt.includes("reemplaz")) return "Reemplazo de panel";
  if (txt.includes("anticorros") || txt.includes("corros")) return "Tratamiento anticorrosivo";
  if (txt.includes("pint")) return "Pintura/retoque";
  if (txt.includes("limp") || txt.includes("lavado")) return "Limpieza";

  return "No requiere reparación";
}

function inferRepairCode(f) {
  const damage = String(f.damage_code || "").toUpperCase();
  const txt = `${f.description || ""} ${f.repair_method || ""} ${f.observations || ""}`.toLowerCase();

  if (damage === "CO") return "PR";
  if (damage === "DT" || damage === "BT" || damage === "BW") return "GS";
  if (damage === "HO" || damage === "PH") return "PT";
  if (damage === "MS" || damage === "DL" || damage === "IR") return "RP";
  if (damage === "DY" || damage === "CT" || damage === "OR" || damage === "OS") return "WW";
  if (damage === "ML" || txt.includes("marca") || txt.includes("sticker")) return "MV";
  if (damage === "CU" || damage === "CK") return "WD";

  return String(f.repair_method_code || "").toUpperCase().slice(0, 2) || "";
}

function inferComponent(f, body) {
  const code = String(f.component_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = String(f.component_name || "");
  if (code) return { code, name: name || code };

  const face = getFaceCode(`${f.face || ""} ${f.cara || ""}`, body);
  const txt = `${f.description || ""} ${f.observations || ""}`.toLowerCase();

  if (face === "D") {
    if (txt.includes("bisagra")) return { code: "HGA", name: "Bisagra completa" };
    if (txt.includes("barra") || txt.includes("cierre")) return { code: "LBR", name: "Barra de puerta" };
    if (txt.includes("manija")) return { code: "LBH", name: "Manija de puerta" };
    if (txt.includes("cerradura")) return { code: "DHL", name: "Cerradura de puerta" };
    if (txt.includes("friza") || txt.includes("empaque") || txt.includes("sello")) return { code: "GTA", name: "Friza de puerta" };
    if (txt.includes("refuerzo superior")) return { code: "DST", name: "Refuerzo de puerta superior" };
    if (txt.includes("refuerzo inferior")) return { code: "DSB", name: "Refuerzo de puerta inferior" };
    return { code: "DPL", name: "Panel/tope de puerta" };
  }

  if (txt.includes("marca") || txt.includes("logo") || txt.includes("número") || txt.includes("numero")) {
    return { code: "MSD", name: "Número/letra de serie o marca" };
  }

  return { code: "PAA", name: "Panel corrugado" };
}
function shortenDescription(text, max = 60, finding = {}) {
  const damage = String(finding.damage_code || "").toUpperCase();

  let s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = s.toLowerCase();

  // Descripciones controladas por tipo de daño
  if (damage === "DT") {
    if (lower.includes("sever") || lower.includes("profund")) {
      return "Abolladura severa en panel";
    }
    if (lower.includes("menor") || lower.includes("leve")) {
      return "Abolladuras menores en panel";
    }
    return "Abolladuras visibles en panel";
  }

  if (damage === "CO") {
    if (lower.includes("óxido") || lower.includes("oxido")) {
      return "Corrosión con óxido activo";
    }
    if (lower.includes("pintura")) {
      return "Corrosión con pérdida de pintura";
    }
    return "Corrosión superficial visible";
  }

  if (damage === "DL") {
    return "Delaminación de pintura en panel";
  }

  if (damage === "BT") {
    return "Panel doblado o deformado";
  }

  if (damage === "GD") {
    return "Rasguños visibles en panel";
  }

  if (damage === "IR") {
    return "Reparación impropia visible";
  }

  if (damage === "ML") {
    return "Marcas o adhesivos visibles";
  }

  if (damage === "DY") {
    return "Suciedad visible en superficie";
  }

  if (damage === "WT") {
    return "Desgaste superficial visible";
  }

  if (damage === "HO") {
    return "Agujero visible en panel";
  }

  if (damage === "CK") {
    return "Grieta visible en panel";
  }

  if (damage === "MS") {
    return "Componente faltante visible";
  }

  if (damage === "OF") {
    return "Hallazgo fuera de estándar";
  }

  // Limpieza general si llega otro texto
  s = s
    .replace(/abolladuras múltiples de gran extensión/gi, "Abolladuras extensas")
    .replace(/abolladuras múltiples severas/gi, "Abolladuras severas")
    .replace(/corrosión generalizada con presencia de óxido activo/gi, "Corrosión con óxido activo")
    .replace(/corrosión activa en zonas con pintura desprendida/gi, "Corrosión con pintura desprendida")
    .replace(/delaminación y levantamiento severo del acero/gi, "Delaminación severa")
    .replace(/se observa una zona central con apariencia de/gi, "Reparación impropia visible")
    .replace(/en mitad inferior del lateral derecho/gi, "")
    .replace(/en la mitad superior/gi, "")
    .replace(/en panel/gi, "")
    .replace(/del panel/gi, "")
    .trim();

  if (s.length <= max) return s;

  // Corte seguro: no deja palabras a medias ni puntos suspensivos
  const words = s.split(" ");
  let result = "";

  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > max) break;
    result = next;
  }

  return result || "Hallazgo visible en contenedor";
}
function sanitizeFinding(f) {
  const out = { ...f };

  out.damage_code = String(out.damage_code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (!DAMAGE_CODES.includes(out.damage_code)) out.damage_code = "OF";

  out.severity = String(out.severity || "").toLowerCase();
  if (!["low","medium","high","critical"].includes(out.severity)) out.severity = "medium";

  out.repair_method = normalizeRepairText(out.repair_method);
  if (!REPAIR_METHODS_TEXT.includes(out.repair_method)) out.repair_method = "No requiere reparación";

  out.bbox_x = clamp01(out.bbox_x, 0.1);
  out.bbox_y = clamp01(out.bbox_y, 0.1);
  out.bbox_w = Math.max(0.01, Math.min(1, Number(out.bbox_w) || 0.1));
  out.bbox_h = Math.max(0.01, Math.min(1, Number(out.bbox_h) || 0.1));

  const c = Number(out.confidence);
  out.confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.85;

  out.description = shortenDescription(out.description, 60, out);
  out.location_detail = String(out.location_detail || "").slice(0, 250);
  out.location_status = String(out.location_status || "").toLowerCase();
  if (!["complete", "partial", "mismatch"].includes(out.location_status)) {
    out.location_status = "partial";
  }
  const locationConfidence = Number(out.location_confidence);
  out.location_confidence = Number.isFinite(locationConfidence)
    ? Math.min(1, Math.max(0, locationConfidence))
    : 0;
  out.location_reason = String(out.location_reason || "").slice(0, 300);
  out.dimensions_mm = String(out.dimensions_mm || "No estimado").slice(0, 80);
  out.observations = String(out.observations || "").slice(0, 500);

  out.repair_method_code = String(out.repair_method_code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (!REPAIR_METHOD_CODES.includes(out.repair_method_code)) {
    out.repair_method_code = inferRepairCode(out);
  }

  return out;
}

function normalizeCyraLocationByFace(f, body) {
  let out = { ...f };

  const faceText = String(
    body.face_name ||
    body.face_id ||
    body.face ||
    body.side ||
    out.face ||
    out.cara ||
    ""
  ).toLowerCase();

  const c1 = getFaceCode(faceText, body);

  out = normalizeLocationDecision(out, c1);

  if (c1 === "D") {
    out.face = "Puerta";
    out.cara = "Puerta";
    out.faceName = "Puerta";
  } else if (c1 === "F") {
    out.face = "Frontal Externo";
    out.cara = "Frontal Externo";
    out.faceName = "Frontal Externo";
  } else if (c1 === "L") {
    out.face = "Lateral Izq. Ext.";
    out.cara = "Lateral Izq. Ext.";
    out.faceName = "Lateral Izq. Ext.";
  } else if (c1 === "R") {
    out.face = "Lateral Derecho Ext.";
    out.cara = "Lateral Derecho Ext.";
    out.faceName = "Lateral Derecho Ext.";
  }

  const component = inferComponent(out, body);
  out.component_code = component.code;
  out.component_name = component.name;
  out.component_label = `${component.code} - ${component.name}`;

  return out;
}

app.post("/api/evaluar-contenedor", async (req, res) => {
  try {
    const body = req.body;

    if (!body.image_base64) {
      return res.status(400).json({
        error: "Falta image_base64."
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Falta configurar ANTHROPIC_API_KEY en el archivo .env."
      });
    }

    let mediaType = body.image_type || body.media_type || "image/jpeg";
    mediaType = String(mediaType).toLowerCase();
    if (mediaType === "image/jpg") mediaType = "image/jpeg";

    const allowedMedia = ["image/jpeg", "image/png", "image/gif", "image/webp"];

    if (!allowedMedia.includes(mediaType)) {
      return res.status(400).json({
        error: `Tipo de imagen no soportado: ${mediaType}`
      });
    }

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: body.image_base64
              }
            },
            {
              type: "text",
              text: buildPrompt(body)
            }
          ]
        }
      ]
    });

    const text = extractText(message.content);
    const parsed = parseJsonLoose(text);

    const codeFromText = getContainerFromText(text);

    parsed.container_id_detected =
      normalizeContainerId(parsed.container_id_detected) ||
      normalizeContainerId(parsed.container_id) ||
      normalizeContainerId(parsed.contenedor) ||
      codeFromText ||
      "";

    if (parsed.invalid) {
      return res.json({
        invalid: true,
        reason: parsed.reason || "La imagen no corresponde a un contenedor marítimo."
      });
    }

    const findings = Array.isArray(parsed.findings)
      ? parsed.findings
          .map(sanitizeFinding)
          .map(f => normalizeCyraLocationByFace(f, body))
      : [];

    return res.json({
      invalid: false,
      container_id_detected: parsed.container_id_detected || "",
      findings
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "No se pudo evaluar el contenedor.",
      detail: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`CYRA AI Evaluator activo en http://localhost:${PORT}`);
  });
}
