// Keep the public demo independent of authenticated board providers and API traffic.
if (window.location.pathname === "/") {
  void import("./landing/main");
} else {
  void import("./main");
}
