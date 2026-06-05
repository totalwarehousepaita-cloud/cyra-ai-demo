import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const DEMO_USER = process.env.DEMO_USER || "cyra";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "CyraDemo2026!";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ADVERTENCIA: falta ANTHROPIC_API_KEY en variables de entorno.");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "cyra_demo2_real_ai.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "CYRA AI",
    model: MODEL
  });
});

app.post("/api/login", (req, res) => {
  const { user, password, username } = req.body || {};
  const inputUser = user || username || "";

  if (inputUser === DEMO_USER && password === DEMO_PASSWORD) {
    return res.json({ ok: true });
  }

  return res.status(401).json({
    ok: false,
    error: "Credenciales no válidas"
  });
});

function cleanBase64(value) {
  const raw = String(value || "");
  if (raw.includes(",")) return raw.split(",").pop();
  return raw;
}

function normalizeContainerId(value) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  return /^[A-Z]{4}\d{7}$/.test(clean) ? clean : "";
}

function findContainerIdInText(text) {
  const raw = String(text || "").toUpperCase();
  const match = raw.match(/\b[A-Z]{4}\s?\d{6}\s?\d\b/);
  return match ? normalizeContainerId(match[0]) : "";
}

function extractJsonLoose(text) {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("CYRA AI no devolvió JSON válido.");
    }

    return JSON.parse(match[0]);
  }
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeSeverity(value) {
  const v = safeString(value, "Media").toLowerCase();

  if (v.includes("alta") || v.includes("severa") || v.includes("grave")) return "Alta";
  if (v.includes("baja") || v.includes("leve") || v.includes("menor")) return "Baja";
  return "Media";
}

function sanitizeFinding(finding = {}) {
  const f = { ...finding };

  const faceName = safeString(
    f.faceName || f.face || f.cara || f.side || f.view,
    "No identificado"
  );

  const cyraLocation = safeString(
    f.cyra_location ||
      f.location ||
      f.location_code ||
      f.codigo_ubicacion ||
      f.cod_cyra,
    "-"
  ).toUpperCase();

  const damageCode = safeString(
    f.damage_code || f.damage || f.codigo_dano || f.codigo_daño,
    "-"
  ).toUpperCase();

  const description = safeString(
    f.description || f.descripcion || f.observacion || f.observation,
    "Hallazgo detectado por CYRA AI."
  );

  const componentCode = safeString(
    f.component_code ||
      f.component ||
      f.component_iso ||
      f.part_code ||
      f.repuesto_codigo,
    ""
  ).toUpperCase();

  const componentName = safeString(
    f.component_name ||
      f.part_name ||
      f.repuesto ||
      f.repuesto_nombre ||
      f.component_description,
    ""
  );

  const repairMethodCode = safeString(
    f.repair_method_code || f.repair_code,
    ""
  ).toUpperCase();

  const repairMethodName = safeString(
    f.repair_method_name ||
      f.repair_method ||
      f.repair ||
      f.metodo_reparacion,
    ""
  );

  const componentLabel =
    componentCode && componentName
      ? `${componentCode} - ${componentName}`
      : componentCode || componentName || "-";

  return {
    faceName,
    face: faceName,
    cara: faceName,
    cyra_location: cyraLocation,
    location: cyraLocation,
    damage_code: damageCode,
    component_code: componentCode || "-",
    component_name: componentName || "-",
    component_label: componentLabel,
    description,
    severity: normalizeSeverity(f.severity || f.severidad),
    dimensions_mm: safeString(f.dimensions_mm || f.dimensions || f.dimension, "-"),
    repair_method_code: repairMethodCode,
    repair_method_name: repairMethodName,
    repair_method: repairMethodName || repairMethodCode || safeString(f.repair_method, "-"),
    confidence: Number.isFinite(Number(f.confidence)) ? Number(f.confidence) : 0.85,
    bbox: f.bbox || f.bounding_box || null
  };
}

function isDoorRequest(body, finding) {
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
    finding?.face,
    finding?.faceName,
    finding?.cara
  ]
    .join(" ")
    .toLowerCase();

  return (
    requestText.includes("puerta") ||
    requestText.includes("door") ||
    requestText.includes("roof") ||
    findingText.includes("puerta") ||
    findingText.includes("door")
  );
}

function forceDoorCodesDPDRDH(finding, body) {
  if (!finding || typeof finding !== "object") return finding;
  if (!isDoorRequest(body, finding)) return finding;

  const text = [
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

  let doorCode = "DP";
  let componentCode = "DPL";
  let componentName = "Panel de puerta";

  if (
    text.includes("bisagra") ||
    text.includes("hinge") ||
    text.includes("barra") ||
    text.includes("cierre") ||
    text.includes("locking") ||
    text.includes("cerradura") ||
    text.includes("manija") ||
    text.includes("handle") ||
    text.includes("sello") ||
    text.includes("empaque") ||
    text.includes("friza") ||
    text.includes("gasket")
  ) {
    doorCode = "DH";

    if (text.includes("bisagra") || text.includes("hinge")) {
      componentCode = "HGA";
      componentName = "Bisagra completa";
    } else if (
      text.includes("barra") ||
      text.includes("cierre") ||
      text.includes("locking")
    ) {
      componentCode = "LBR";
      componentName = "Barra de cierre de puerta";
    } else if (text.includes("cerradura")) {
      componentCode = "DHL";
      componentName = "Cerradura de puerta";
    } else if (text.includes("manija") || text.includes("handle")) {
      componentCode = "LBH";
      componentName = "Manija de puerta";
    } else if (
      text.includes("sello") ||
      text.includes("empaque") ||
      text.includes("friza") ||
      text.includes("gasket")
    ) {
      componentCode = "GTA";
      componentName = "Friza / empaque de puerta";
    }
  } else if (
    text.includes("puerta derecha") ||
    text.includes("hoja derecha") ||
    text.includes("right door") ||
    text.includes("derecha de la puerta")
  ) {
    doorCode = "DR";
    componentCode = "DPL";
    componentName = "Panel de puerta derecha";
  } else {
    doorCode = "DP";
    componentCode = "DPL";
    componentName = "Panel de puerta";
  }

  finding.faceName = "Puerta";
  finding.face = "Puerta";
  finding.cara = "Puerta";
  finding.cyra_location = doorCode;
  finding.location = doorCode;
  finding.component_code = componentCode;
  finding.component_name = componentName;
  finding.component_label = `${componentCode} - ${componentName}`;

  return finding;
}

function buildPrompt(faceName = "") {
  return `
Eres CYRA AI, inspector visual especializado en contenedores reefer y dry van.

Analiza la imagen enviada y devuelve SOLO JSON válido. No incluyas texto fuera del JSON.

CARA / VISTA ANALIZADA:
${faceName || "No especificada"}

REGLAS GENERALES:
- Identifica daños visibles: corrosión, abolladuras, perforaciones, suciedad, marcas, reparaciones previas, deformaciones, componentes rotos o faltantes.
- Si no hay daño visible, devuelve findings como arreglo vacío.
- No inventes daños.
- No uses marcas de proveedor externo.
- No digas “simulación”.
- Usa solo “CYRA AI” si necesitas referirte al motor.

LECTURA DEL CONTENEDOR:
- Siempre intenta leer el código ISO 6346 visible en la imagen.
- Formato: 4 letras + 7 números. Ejemplos: SEGU9824376, MSKU0841501.
- Puede estar vertical u horizontal, especialmente en puertas.
- Si lo puedes leer, devuelve container_id_detected a nivel principal.
- Si no lo lees, devuelve container_id_detected como cadena vacía.
- No inventes códigos.

REGLA FINAL DE PUERTA:
Si la cara analizada es Puerta, el código CYRA debe ser únicamente:
- DP = daño en panel u hoja de puerta.
- DR = daño específico en puerta derecha.
- DH = herrajes de puerta: bisagra, barra de cierre, cerradura, manija, sello, friza o empaque.

Nunca uses códigos de lateral/frontal/techo para Puerta, tales como:
PLTN, PRTN, PLBN, PRBN, RLTN, RRTN, RLBN, RRBN, TL, TR, RB, RL, RR, FT o similares.

COMPONENTES / REPUESTOS:
Devuelve componente/repuesto afectado:
- Puerta panel: DPL - Panel de puerta.
- Puerta derecha: DPL - Panel de puerta derecha.
- Bisagra: HGA - Bisagra completa.
- Barra de cierre: LBR - Barra de cierre de puerta.
- Cerradura: DHL - Cerradura de puerta.
- Manija: LBH - Manija de puerta.
- Friza/empaque/sello: GTA - Friza / empaque de puerta.

FORMATO JSON OBLIGATORIO:
{
  "invalid": false,
  "container_id_detected": "",
  "findings": [
    {
      "faceName": "",
      "cyra_location": "",
      "damage_code": "",
      "component_code": "",
      "component_name": "",
      "description": "",
      "severity": "",
      "dimensions_mm": "",
      "repair_method_code": "",
      "repair_method_name": "",
      "repair_method": "",
      "confidence": 0.85,
      "bbox": null
    }
  ]
}
`;
}

app.post("/api/evaluar-contenedor", async (req, res) => {
  try {
    const body = req.body || {};

    const imageBase64 = cleanBase64(
      body.image_base64 ||
        body.image ||
        body.base64 ||
        body.data ||
        body.dataUrl
    );

    if (!imageBase64) {
      return res.status(400).json({
        error: "No se recibió imagen para analizar."
      });
    }

    const mediaType = body.media_type || body.mime || "image/jpeg";
    const allowedMedia = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMedia.includes(mediaType)) {
      return res.status(400).json({
        error: `Tipo de imagen no soportado: ${mediaType}`
      });
    }

    const faceName =
      body.faceName ||
      body.face ||
      body.side ||
      body.view ||
      body.cara ||
      "";

    const prompt = buildPrompt(faceName);

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64
              }
            }
          ]
        }
      ]
    });

    const text = message.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    const parsed = extractJsonLoose(text);

    parsed.container_id_detected =
      normalizeContainerId(parsed.container_id_detected) ||
      normalizeContainerId(parsed.container_id) ||
      normalizeContainerId(parsed.contenedor) ||
      findContainerIdInText(text) ||
      "";

    let findings = Array.isArray(parsed.findings)
      ? parsed.findings.map(sanitizeFinding)
      : [];

    findings = findings.map((finding) => forceDoorCodesDPDRDH(finding, body));

    return res.json({
      invalid: Boolean(parsed.invalid) || false,
      container_id_detected: parsed.container_id_detected || "",
      findings
    });
  } catch (error) {
    console.error("CYRA AI error:", error);

    return res.status(500).json({
      error: "CYRA AI no pudo completar el análisis en este momento.",
      detail: error.message || "Error no especificado"
    });
  }
});

app.listen(PORT, () => {
  console.log(`CYRA AI Evaluator activo en http://localhost:${PORT}`);
});
