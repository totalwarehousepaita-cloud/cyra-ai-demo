import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const app = express();

app.use(cors({
  origin: true
}));
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

const REPAIR_METHODS = [
  "Soldadura",
  "Parche estructural",
  "Reemplazo de panel",
  "Enderezado",
  "Tratamiento anticorrosivo",
  "Pintura/retoque",
  "Limpieza",
  "No requiere reparación"
];

function buildPrompt(body) {
  return `
Eres un inspector certificado IICL especializado en inspección visual de contenedores marítimos secos.

CONTEXTO DE INSPECCIÓN:
- ID inspección: ${body.inspection_id || ""}
- Contenedor: ${body.container_id || ""}
- Tipo: ${body.container_type || ""}
- Operación: ${body.operation || ""}
- Depósito: ${body.depot || ""}
- Cara evaluada: ${body.face_name || body.face_id || ""}

TAREA:
Analiza la imagen y devuelve resultados reales observables. No inventes daños. Si no hay daños visibles, devuelve findings vacío.

VALIDACIÓN DE IMAGEN:
Si la imagen NO muestra una superficie real de contenedor marítimo, devuelve exactamente:
{
  "invalid": true,
  "reason": "explica brevemente qué muestra la imagen"
}

CRITERIO DE UBICACIÓN CYRA:
Divide la imagen en una cuadrícula:
- Para laterales/frontal:
  H = rail superior o zona superior 0-12%
  T = panel superior 12-50%
  B = panel inferior 50-88%
  G = rail inferior 88-100%
- Columnas X: 10 columnas iguales de izquierda a derecha. Usa 1-9 y 0 para la décima.
- Para puerta: usa L mitad izquierda y R mitad derecha.
- Código CYRA: Char1 según cara R/L/F/T + Char2 ubicación H/T/B/G o L/R + Char3 columna inicial + Char4 N si es único o columna final si abarca varias.
Ejemplos: RT4N, LB67, FH2N, TL3N.

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

SEVERIDAD:
- low: cosmético o desgaste menor
- medium: requiere reparación o seguimiento
- high: reparación inmediata
- critical: probable fuera de servicio

MÉTODOS DE REPARACIÓN PERMITIDOS:
${REPAIR_METHODS.join(", ")}

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
      "cyra_location": "RT4N",
      "location_detail": "ubicación legible",
      "bbox_x": 0.30,
      "bbox_y": 0.20,
      "bbox_w": 0.18,
      "bbox_h": 0.22,
      "severity": "low|medium|high|critical",
      "dimensions_mm": "largo x ancho estimado",
      "repair_method": "método permitido",
      "observations": "notas técnicas",
      "confidence": 0.90,
      "container_id_detected": "CONTENEDOR_VISIBLE"
    }
  ]
}

Reglas:
- bbox_x, bbox_y, bbox_w y bbox_h deben estar entre 0 y 1 respecto al tamaño de la imagen.
- Usa solo códigos de daño permitidos.
- Usa solo métodos de reparación permitidos.
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
  const clean = text
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

function sanitizeFinding(f) {
  const out = { ...f };

  if (!DAMAGE_CODES.includes(out.damage_code)) out.damage_code = "WT";
  if (!["low","medium","high","critical"].includes(out.severity)) out.severity = "medium";
  if (!REPAIR_METHODS.includes(out.repair_method)) out.repair_method = "No requiere reparación";

  for (const k of ["bbox_x","bbox_y","bbox_w","bbox_h"]) {
    const n = Number(out[k]);
    out[k] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.1;
  }

  const c = Number(out.confidence);
  out.confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.85;

  out.description = String(out.description || "").slice(0, 500);
  out.location_detail = String(out.location_detail || "").slice(0, 250);
  out.dimensions_mm = String(out.dimensions_mm || "No estimado").slice(0, 80);
  out.observations = String(out.observations || "").slice(0, 500);

  return out;
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "CYRA AI Evaluator",
    model: MODEL
  });
});

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

    const mediaType = body.image_type || "image/jpeg";
    const allowedMedia = ["image/jpeg", "image/png", "image/gif", "image/webp"];

    if (!allowedMedia.includes(mediaType)) {
      return res.status(400).json({
        error: `Tipo de imagen no soportado: ${mediaType}`
      });
    }

    // 
// REGLA CYRA PARA CÓDIGO DE CONTENEDOR:
// - Intenta leer el código ISO 6346 visible en la imagen.
// - El formato es 4 letras + 7 números. Ejemplo: MSKU0841501.
// - Puede estar vertical u horizontal.
// - Si lo lees, devuelve "container_id_detected" a nivel principal.
// - Si no lo lees, devuelve "container_id_detected": "".
// - No inventes códigos.
// - No uses códigos predeterminados.
// 
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

    // CYRA_CONTAINER_ID_FINAL_SAFE
    function cyraNormalizeContainerId(value) {
      const clean = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
      return /^[A-Z]{4}\d{7}$/.test(clean) ? clean : "";
    }

    const cyraCodeFromTextMatch = String(text || "").toUpperCase().match(/\b[A-Z]{4}\s?\d{6}\s?\d\b/);
    const cyraCodeFromText = cyraCodeFromTextMatch ? cyraNormalizeContainerId(cyraCodeFromTextMatch[0]) : "";

    parsed.container_id_detected =
      cyraNormalizeContainerId(parsed.container_id_detected) ||
      cyraNormalizeContainerId(parsed.container_id) ||
      cyraNormalizeContainerId(parsed.contenedor) ||
      cyraCodeFromText ||
      "";

    if (parsed.invalid) {
      return res.json({
        invalid: true,
        reason: parsed.reason || "La imagen no corresponde a un contenedor marítimo."
      });
    }

    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.map(sanitizeFinding)
      : [];

    res.json({
      invalid: false,
      container_id_detected: parsed.container_id_detected || "",
      findings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo evaluar el contenedor.",
      detail: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CYRA AI Evaluator activo en http://localhost:${PORT}`);
});
