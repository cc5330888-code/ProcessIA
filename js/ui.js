// js/ui.js — manejo de interfaz: render de resultados y estados

/**
 * Pinta el resultado del análisis en las 6 tarjetas + el diagrama de flujo.
 */
function renderAnalysis(data) {
  // Diagrama de flujo dinámico (si la IA devolvió "diagrama")
  if (data.diagrama) {
    renderFlowDiagram(data.diagrama, "flow-diagram-container");
  } else {
    const container = document.getElementById("flow-diagram-container");
    if (container) container.style.display = "none";
  }

  setCardContent("objetivo", data.objetivo);
  setCardContent("sipoc", renderSIPOC(data.sipoc));
  function renderSIPOC(sipoc){

    if(!sipoc) return "";

return `
<div class="sipoc-wrapper">

<table class="sipoc-table">

    <thead>
        <tr>
            <th>Supplier</th>
            <th>Input</th>
            <th>Process</th>
            <th>Output</th>
            <th>Customer</th>
        </tr>
    </thead>

    <tbody>

        <tr>

            <td>
                <ul class="sipoc-list">
                    ${sipoc.supplier.map(item=>`<li>${item}</li>`).join("")}
                </ul>
            </td>

            <td>
                <ul class="sipoc-list">
                    ${sipoc.input.map(item=>`<li>${item}</li>`).join("")}
                </ul>
            </td>

            <td>
                <ul class="sipoc-list">
                    ${sipoc.process.map(item=>`<li>${item}</li>`).join("")}
                </ul>
            </td>

            <td>
                <ul class="sipoc-list">
                    ${sipoc.output.map(item=>`<li>${item}</li>`).join("")}
                </ul>
            </td>

            <td>
                <ul class="sipoc-list">
                    ${sipoc.customer.map(item=>`<li>${item}</li>`).join("")}
                </ul>
            </td>

        </tr>

    </tbody>

</table>

</div>
`;
}
  setCardContent("indicadores", data.indicadores);
  setCardContent("riesgos", data.riesgos);
  setCardContent("bpa", data.bpa);
  setCardContent("rpa", data.rpa);

  // Reinicia la animación de entrada de las tarjetas (útil si el usuario
  // vuelve a analizar un proceso sin recargar la página)
  document.querySelectorAll(".card").forEach((card) => {
    card.style.animation = "none";
    void card.offsetWidth; // fuerza reflow
    card.style.animation = "";
  });
}

function setCardContent(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!value) {
    el.innerHTML = "";
    return;
  }

  // El SIPOC ya se renderiza aparte como tabla
  if (id === "sipoc") {
    el.innerHTML = value;
    return;
  }

  // Convierte texto separado por <br> en lista
  if (typeof value === "string") {
    const items = value
      .split("<br>")
      .map(item => item.trim())
      .filter(item => item.length > 0);

    if (items.length > 1) {
      el.innerHTML = `
        <ul class="result-list">
          ${items.map(item => `<li>${item}</li>`).join("")}
        </ul>
      `;
      return;
    }
  }

  el.innerHTML = value;
}

/**
 * Estado del botón "Analizar" — deshabilita y muestra spinner.
 */
function setLoading(isLoading) {
  const btn = document.getElementById("analizar");
  const btnText = btn.querySelector(".btn-text");

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("is-loading");
    btnText.textContent = "Analizando…";
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btnText.textContent = "Analizar proceso";
  }
}

/**
 * Muestra un mensaje de estado (loading / success / neutral) bajo el input.
 */
function showStatus(message, type = "neutral") {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-loading", "is-success");

  if (type === "loading") statusEl.classList.add("is-loading");
  if (type === "success") statusEl.classList.add("is-success");
}

/**
 * Muestra un mensaje de error bajo el input.
 */
function showError(message) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.classList.remove("is-loading", "is-success");
  statusEl.classList.add("is-error");
}

/**
 * Usado por api.js durante los reintentos (429/503) para informar
 * al usuario sin tocar el estado de error/success.
 */
function setGeminiStatus(message) {
  showStatus(message, "loading");
}