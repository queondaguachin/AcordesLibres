/* Tema antes del primer render para evitar parpadeo.
   Va en un archivo aparte para poder usar una CSP estricta. */
try {
  var savedTheme = localStorage.getItem("al_theme");
  if (savedTheme === "dark" || savedTheme === "light") {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch (error) {
  /* localStorage no disponible */
}
