(function () {
  try {
    localStorage.removeItem("hexa-ui");
  } catch (_) {}
  var ua = navigator.userAgent || "";
  var iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var apple = iOS || (/Mac OS X|Macintosh/.test(ua) && !android);
  document.documentElement.setAttribute("data-ui", apple ? "cupertino" : "material");
})();
