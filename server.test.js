import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocationDecision } from "./location.js";

function locationFinding(overrides = {}) {
  return {
    cyra_location: "RT5N",
    location_status: "complete",
    location_confidence: 0.9,
    ...overrides
  };
}

test("conserva un código completo válido cuando hay contexto suficiente", () => {
  const result = normalizeLocationDecision(locationFinding(), "R");

  assert.equal(result.cyra_location, "RT5N");
  assert.equal(result.location_status, "complete");
  assert.equal(result.location_reason, "");
});

test("una foto cerrada conserva solo la cara seleccionada", () => {
  const result = normalizeLocationDecision(locationFinding({
    location_status: "partial",
    location_reason: "La foto no muestra bordes ni secciones."
  }), "R");

  assert.equal(result.cyra_location, "R");
  assert.equal(result.location_status, "partial");
  assert.equal(result.location_reason, "La foto no muestra bordes ni secciones.");
});

test("no acepta un código completo con baja confianza de ubicación", () => {
  const result = normalizeLocationDecision(locationFinding({
    location_confidence: 0.4
  }), "R");

  assert.equal(result.cyra_location, "R");
  assert.equal(result.location_status, "partial");
});

test("no acepta un código perteneciente a otra cara", () => {
  const result = normalizeLocationDecision(locationFinding({
    cyra_location: "LT5N"
  }), "R");

  assert.equal(result.cyra_location, "R");
  assert.equal(result.location_status, "partial");
});

test("una incompatibilidad conserva la cara elegida y la advertencia", () => {
  const result = normalizeLocationDecision(locationFinding({
    location_status: "mismatch",
    location_reason: "La imagen parece mostrar una puerta."
  }), "R");

  assert.equal(result.cyra_location, "R");
  assert.equal(result.location_status, "mismatch");
  assert.equal(result.location_reason, "La imagen parece mostrar una puerta.");
});

test("valida correctamente un código completo de puerta", () => {
  const result = normalizeLocationDecision(locationFinding({
    cyra_location: "DT2N"
  }), "D");

  assert.equal(result.cyra_location, "DT2N");
  assert.equal(result.location_status, "complete");
});
