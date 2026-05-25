# CYRA AI Evaluator - IA real para inspección de contenedores

Este paquete reemplaza la conexión directa del HTML a Claude por un backend seguro.

## 1. Instalar Node.js

Instala Node.js 20 o superior.

## 2. Instalar dependencias

Abre una terminal en esta carpeta y ejecuta:

```bash
npm install
```

## 3. Configurar API key

Copia `.env.example` como `.env`:

```bash
copy .env.example .env
```

En Mac/Linux:

```bash
cp .env.example .env
```

Edita `.env` y coloca tu clave:

```env
ANTHROPIC_API_KEY=tu_clave_real
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PORT=3000
```

## 4. Ejecutar backend

```bash
npm start
```

Debe salir:

```text
CYRA AI Evaluator activo en http://localhost:3000
```

## 5. Abrir el HTML

Abre `cyra_demo2_real_ai.html` en el navegador.

El HTML llamará a:

```text
http://localhost:3000/api/evaluar-contenedor
```

## 6. Flujo de prueba

1. Inicia sesión en la demo.
2. Carga las 4 caras del contenedor.
3. Presiona "PROCESAR INSPECCIÓN IA".
4. El backend enviará cada imagen a Claude Vision.
5. La respuesta volverá al HTML como JSON estructurado.
6. El sistema mostrará daños, bounding boxes, severidad, reparación y EIR final.

## Nota importante

Para producción, no uses `localhost`. Debes desplegar el backend en un servidor y cambiar en el HTML:

```js
fetch('http://localhost:3000/api/evaluar-contenedor')
```

por la URL real de tu servidor.
