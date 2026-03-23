(() => {
  // src/index.js
  var client = window.ZAFClient ? ZAFClient.init() : null;
  if (client) {
    client.invoke("resize", { width: "100%", height: "80px" });
    document.getElementById("app").textContent = "Sidebar app loaded.";
  }
})();
