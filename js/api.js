// js/api.js — conexión con la API de Groq

const API_KEY = "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";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500; // base, crece exponencialmente

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Limpia la respuesta del modelo por si viene envuelta en ```json ... ```
 * o con texto extra antes/después del objeto JSON.
 */
function extractJSON(rawText) {
  let cleaned = rawText.trim();

  // Quita fences de markdown si existen
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "");
  cleaned = cleaned.replace(/```\s*$/, "");

  // Si aún hay texto antes/después, recorta al primer { y al último }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Envía el proceso descrito por el usuario a Groq y devuelve el JSON
 * ya parseado con las claves: objetivo, sipoc, indicadores, riesgos,
 * bpa, rpa, pasos.
 */
async function analyzeWithGroq(procesoTexto) {
  let intento = 0;
  let ultimoError = null;

  while (intento < MAX_RETRIES) {
    try {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: PROCESSIA_PROMPT },
            { role: "user", content: procesoTexto }
          ]
        })
      });

      // Reintenta si el servidor está saturado o hay rate limit
      if (response.status === 429 || response.status === 503) {
        intento++;
        if (intento >= MAX_RETRIES) {
          throw new Error("El servicio de IA está saturado. Intenta de nuevo en unos segundos.");
        }
        setGeminiStatus(`Servidor ocupado, reintentando (${intento}/${MAX_RETRIES})…`);
        await sleep(RETRY_DELAY_MS * intento);
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Groq API error:", response.status, errBody);
        throw new Error(`Error de la API (${response.status}). Verifica tu API key o intenta de nuevo.`);
      }

      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;

      if (!rawContent) {
        throw new Error("La IA no devolvió contenido. Intenta reformular la descripción.");
      }

      let parsed;
      try {
        parsed = extractJSON(rawContent);
      } catch (parseErr) {
        console.error("Error parseando JSON:", parseErr, rawContent);
        throw new Error("La IA devolvió un formato inesperado. Intenta analizar de nuevo.");
      }

      // Validación mínima de claves esperadas
      const requiredKeys = ["objetivo", "sipoc", "indicadores", "riesgos", "bpa", "rpa"];
      const faltantes = requiredKeys.filter((k) => !(k in parsed));
      if (faltantes.length > 0) {
        console.warn("Faltan claves en la respuesta:", faltantes);
      }

      return parsed;

    } catch (err) {
      ultimoError = err;
      // Si fue un error de red (fetch falló), reintenta también
      if (err instanceof TypeError) {
        intento++;
        if (intento >= MAX_RETRIES) break;
        await sleep(RETRY_DELAY_MS * intento);
        continue;
      }
      // Otros errores (parseo, API key, etc.) no se reintentan, se lanzan directo
      throw err;
    }
  }

  throw ultimoError || new Error("No se pudo completar el análisis tras varios intentos.");
}