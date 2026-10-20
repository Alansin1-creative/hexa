const THEME_KEY = "hexa-theme";

function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem(THEME_KEY, name);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute("content", color);
}

applyTheme(localStorage.getItem(THEME_KEY) || "nocturno");

document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.themeBtn));
});

function money(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
}

function portada(estilo) {
  return (
    estilo?.imagenes?.frente ||
    estilo?.imagenes?.detras ||
    Object.values(estilo?.imagenes || {})[0] ||
    ""
  );
}
