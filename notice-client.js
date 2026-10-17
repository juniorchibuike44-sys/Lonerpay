/* Shared LonerPay notices. Native confirmations remain unchanged. */
(function () {
  "use strict";
  const queue = [];
  let active = false;
  function showNext() {
    if (active || !queue.length || !document.body) return;
    active = true;
    const item = queue.shift();
    const previous = document.activeElement;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(40,37,30,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box";
    const card = document.createElement("section");
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "lpNoticeTitle");
    card.setAttribute("aria-describedby", "lpNoticeText");
    card.style.cssText = "width:100%;max-width:400px;max-height:85dvh;overflow:auto;background:white;border-radius:24px;padding:26px;box-shadow:0 24px 80px #0004;color:#28251e;font-family:Inter,system-ui,sans-serif;box-sizing:border-box";
    const brand = document.createElement("div");
    brand.textContent = "L";
    brand.style.cssText = "width:48px;height:48px;display:grid;place-items:center;border-radius:16px;background:#936514;color:white;font-size:26px;font-weight:800;margin-bottom:18px";
    const title = document.createElement("h2");
    title.id = "lpNoticeTitle";
    title.textContent = "LonerPay";
    title.style.cssText = "font-size:23px;margin:0 0 12px";
    const message = document.createElement("p");
    message.id = "lpNoticeText";
    message.textContent = item.message;
    message.style.cssText = "font-size:15px;line-height:1.6;color:#746c5c;margin:0 0 24px;white-space:pre-wrap;overflow-wrap:anywhere";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Got it";
    button.style.cssText = "width:100%;min-height:50px;border:0;border-radius:13px;background:#936514;color:white;font:700 16px system-ui;cursor:pointer";
    function close() {
      overlay.remove();
      active = false;
      if (previous && previous.isConnected) previous.focus();
      item.resolve();
      showNext();
    }
    button.onclick = close;
    overlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") { event.preventDefault(); button.focus(); }
    });
    card.append(brand, title, message, button);
    overlay.append(card);
    document.body.append(overlay);
    button.focus();
  }
  window.lpNotice = function (message) {
    return new Promise(function (resolve) {
      queue.push({ message: String(message == null ? "" : message), resolve: resolve });
      showNext();
    });
  };
  window.alert = window.lpNotice;
  document.addEventListener("DOMContentLoaded", showNext);
})();

