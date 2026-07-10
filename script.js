// script.js — orquestador principal de ProcessIA

document.addEventListener("DOMContentLoaded", () => {
  const btnAnalizar = document.getElementById("analizar");
  const inputProceso = document.getElementById("proceso-input");
  const charCount = document.getElementById("char-count");

  // Contador de caracteres en vivo
  inputProceso.addEventListener("input", () => {
    charCount.textContent = `${inputProceso.value.length} caracteres`;
  });

  // Diagrama decorativo del hero (grafo genérico, solo estético)
  if (typeof renderFlowDiagram === "function") {
    renderFlowDiagram(
      {
        nodos: [
          { id: "h1", tipo: "inicio", nombre: "Inicio", actor: "Cliente" },
          { id: "h2", tipo: "tarea", nombre: "Solicitud", actor: "Cliente" },
          { id: "h3", tipo: "decision", nombre: "¿Cumple?", actor: "Sistema" },
          { id: "h4", tipo: "tarea", nombre: "Aprobación", actor: "Sistema" },
          { id: "h5", tipo: "tarea", nombre: "Rechazo", actor: "Sistema" },
          { id: "h6", tipo: "fin", nombre: "Fin", actor: "Sistema" }
        ],
        conexiones: [
          { desde: "h1", hasta: "h2" },
          { desde: "h2", hasta: "h3" },
          { desde: "h3", hasta: "h4", etiqueta: "Sí" },
          { desde: "h3", hasta: "h5", etiqueta: "No" },
          { desde: "h4", hasta: "h6" },
          { desde: "h5", hasta: "h6" }
        ]
      },
      "hero-flow-diagram"
    );
  }

  btnAnalizar.addEventListener("click", startAnalysis);

  // Enviar con Ctrl+Enter desde el textarea
  inputProceso.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      startAnalysis();
    }
  });
});

async function startAnalysis() {
  const inputProceso = document.getElementById("proceso-input");
  const texto = inputProceso.value.trim();

  if (!texto) {
    showError("Escribe la descripción de un proceso antes de analizar.");
    return;
  }

  if (texto.length < 20) {
    showError("Danos un poco más de detalle del proceso (mínimo 20 caracteres).");
    return;
  }

  setLoading(true);
  showStatus("Analizando proceso con IA…", "loading");

  try {
    const data = await analyzeWithGroq(texto);
    renderAnalysis(data);
    showStatus("Análisis completado.", "success");
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    showError(err.message || "Ocurrió un error al analizar el proceso. Intenta de nuevo.");
  } finally {
    setLoading(false);
  }
}