// GET /widget.js: the script businesses add to their website with one line:
//   <script src="https://<this app>/widget.js" data-agent="wg_..." async></script>
// It draws a chat button (inside a shadow root, so the site's CSS can't touch it) and opens the
// chat from this app in a frame. No dependencies, nothing else on the page is read or changed.

const SCRIPT = String.raw`(function () {
  var script = document.currentScript;
  if (!script || window.__vesperWidget) return;
  var id = script.getAttribute("data-agent");
  if (!id) return;
  window.__vesperWidget = true;
  var origin = new URL(script.src).origin;

  // The page's host: the button only appears on the business's allowed sites.
  fetch(origin + "/api/widget/" + encodeURIComponent(id) + "?host=" + encodeURIComponent(location.hostname))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (config) { if (config) mount(config); })
    .catch(function () {});

  function mount(config) {
    var color = /^#[0-9a-fA-F]{6}$/.test(config.color) ? config.color : "#6d43f5";
    var host = document.createElement("div");
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;";
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".launcher{width:60px;height:60px;border:0;border-radius:50%;cursor:pointer;color:#fff;" +
      "background:" + color + ";box-shadow:0 10px 30px -8px rgba(0,0,0,.45);display:flex;" +
      "align-items:center;justify-content:center;transition:transform .15s}" +
      ".launcher:hover{transform:scale(1.06)}" +
      ".launcher svg{width:26px;height:26px}" +
      ".dot{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#ef4444;" +
      "border:2px solid #fff;display:none}.dot.on{display:block}" +
      ".launcher{position:relative}" +
      ".panel{position:fixed;right:20px;bottom:92px;width:380px;height:min(640px,calc(100vh - 120px));" +
      "border-radius:18px;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.45);" +
      "background:#fff;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .2s,transform .2s}" +
      ".panel.open{opacity:1;transform:none;pointer-events:auto}" +
      ".panel iframe{width:100%;height:100%;border:0;display:block}" +
      "@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0}" +
      ".panel.open + .launcher{display:none}}" +
      "</style>" +
      '<div class="panel" part="panel"></div>' +
      '<button class="launcher" type="button"></button>';
    var panel = root.querySelector(".panel");
    var button = root.querySelector(".launcher");
    var chatIcon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var closeIcon =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    var title = String(config.title || "Chat");
    var open = false;

    var unread = false;
    function render() {
      button.innerHTML = (open ? closeIcon : chatIcon) + '<span class="dot' + (unread && !open ? " on" : "") + '"></span>';
      button.setAttribute("aria-label", (open ? "Close chat with " : "Chat with ") + title);
      button.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("open", open);
    }
    function toggle(next) {
      open = next;
      if (open && !panel.firstChild) {
        var frame = document.createElement("iframe");
        frame.src = origin + "/embed/" + encodeURIComponent(id);
        frame.title = "Chat with " + title;
        frame.allow = "microphone; autoplay";
        panel.appendChild(frame);
      }
      if (open) unread = false;
      var frameWindow = panel.firstChild && panel.firstChild.contentWindow;
      if (frameWindow) frameWindow.postMessage(open ? "vesper:opened" : "vesper:closed", origin);
      render();
    }
    button.addEventListener("click", function () { toggle(!open); });
    window.addEventListener("message", function (event) {
      if (event.origin !== origin) return;
      if (event.data === "vesper:close") toggle(false);
      // The team (or the assistant) wrote while the chat was closed.
      if (event.data === "vesper:unread" && !open) {
        unread = true;
        render();
      }
    });
    render();
    document.body.appendChild(host);
  }
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
