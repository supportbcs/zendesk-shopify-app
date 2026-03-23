(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/api.js
  var require_api = __commonJS({
    "src/api.js"(exports, module) {
      function buildRequest(path, options) {
        var opts = options || {};
        var req = {
          url: "{{setting.backendUrl}}" + path,
          type: opts.method || "GET",
          contentType: "application/json",
          headers: {
            Authorization: "Bearer {{jwt.token}}"
          },
          jwt: {
            algorithm: "HS256",
            secret_key: "{{setting.shared_secret}}",
            expiry: 3600
          },
          secure: true
        };
        if (opts.body) {
          req.data = JSON.stringify(opts.body);
        }
        return req;
      }
      function getOrders(client, ticketId) {
        return client.request(
          buildRequest("/api/orders?ticketId=" + encodeURIComponent(ticketId))
        );
      }
      function triggerLookup(client, ticketId) {
        return client.request(
          buildRequest("/api/lookup", {
            method: "POST",
            body: { ticketId: String(ticketId) }
          })
        );
      }
      function selectOrder(client, ticketId, orderId) {
        return client.request(
          buildRequest("/api/select-order", {
            method: "POST",
            body: { ticketId: String(ticketId), orderId: String(orderId) }
          })
        );
      }
      module.exports = { buildRequest, getOrders, triggerLookup, selectOrder };
    }
  });

  // src/poller.js
  var require_poller = __commonJS({
    "src/poller.js"(exports, module) {
      function defaultDelay(ms) {
        return new Promise(function(resolve) {
          setTimeout(resolve, ms);
        });
      }
      async function pollForOrders(fetchFn, options) {
        var opts = options || {};
        var interval = opts.interval || 2e3;
        var maxRetries = opts.maxRetries || 5;
        var delay = opts.delayFn || defaultDelay;
        for (var attempt = 0; attempt < maxRetries; attempt++) {
          try {
            return await fetchFn();
          } catch (err) {
            if (err && err.status && err.status !== 404) {
              throw err;
            }
            if (attempt < maxRetries - 1) {
              await delay(interval);
            }
          }
        }
        throw new Error("max_retries");
      }
      module.exports = { pollForOrders };
    }
  });

  // src/ui.js
  var require_ui = __commonJS({
    "src/ui.js"(exports, module) {
      function escapeHtml(str) {
        if (str === null || str === void 0) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }
      function formatDate(isoString) {
        if (!isoString) return "";
        var d = new Date(isoString);
        return d.toLocaleDateString("en-GB", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }
      function formatTimeAgo(isoString) {
        if (!isoString) return "";
        var now = Date.now();
        var then = new Date(isoString).getTime();
        var diffMs = now - then;
        var diffMin = Math.floor(diffMs / 6e4);
        var diffHrs = Math.floor(diffMs / 36e5);
        var diffDays = Math.floor(diffMs / 864e5);
        if (diffMin < 1) return "just now";
        if (diffMin < 60) return diffMin + " min ago";
        if (diffHrs < 24) return diffHrs + " hours ago";
        return diffDays + " days ago";
      }
      function renderLoading() {
        return '<div class="state-message loading"><div class="spinner"></div><p>Loading order data...</p></div>';
      }
      function renderError(message) {
        return '<div class="state-message error"><p>' + escapeHtml(message) + '</p><button id="refresh-btn" class="c-btn c-btn--primary">Retry</button></div>';
      }
      function renderNoOrders() {
        return '<div class="state-message empty"><p>No Shopify orders found for this customer.</p><button id="refresh-btn" class="c-btn c-btn--primary">Refresh</button></div>';
      }
      function renderStoreNotConfigured() {
        return '<div class="state-message error"><p>Store not configured \u2014 contact admin.</p></div>';
      }
      function renderOrderSelector(orders, selectedOrderId) {
        if (!orders || orders.length <= 1) return "";
        var options = orders.map(function(order) {
          var date = formatDate(order.created_at);
          var selected = order.shopify_order_id === selectedOrderId ? " selected" : "";
          return '<option value="' + escapeHtml(order.shopify_order_id) + '"' + selected + ">" + escapeHtml(order.order_name) + " (" + escapeHtml(date) + ")</option>";
        }).join("");
        return '<div class="order-selector"><select id="order-select" class="c-txt__input">' + options + "</select></div>";
      }
      function renderTrackingSection(order) {
        if (!order.tracking_numbers || order.tracking_numbers.length === 0) return "";
        var links = order.tracking_numbers.map(function(num, i) {
          var url = order.tracking_urls && order.tracking_urls[i];
          if (url) {
            return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(num) + "</a>";
          }
          return "<span>" + escapeHtml(num) + "</span>";
        }).join(", ");
        return '<div class="field"><span class="label">Tracking</span><span class="value">' + links + "</span></div>";
      }
      function renderLineItems(items) {
        if (!items || items.length === 0) return "";
        var listItems = items.map(function(item) {
          return "<li>" + escapeHtml(item.quantity) + "x " + escapeHtml(item.title) + "</li>";
        }).join("");
        return '<div class="field"><span class="label">Products</span><ul class="product-list">' + listItems + "</ul></div>";
      }
      function renderOrderData(data) {
        if (!data.orders || data.orders.length === 0) {
          return renderNoOrders();
        }
        var selectedId = data.selected_order_id;
        var order = data.orders.find(function(o) {
          return o.shopify_order_id === selectedId;
        });
        if (!order) order = data.orders[0];
        var shopifyUrl = "https://" + escapeHtml(data.shopify_domain) + "/admin/orders/" + escapeHtml(order.shopify_order_id);
        var shippingHtml = "";
        if (order.shipping_address) {
          shippingHtml = '<div class="field"><span class="label">Shipping</span><span class="value address">' + escapeHtml(order.shipping_address).replace(/\n/g, "<br>") + "</span></div>";
        }
        var tagsHtml = "";
        if (order.tags) {
          tagsHtml = '<div class="field"><span class="label">Tags</span><span class="value">' + escapeHtml(order.tags) + "</span></div>";
        }
        var noteHtml = "";
        if (order.customer_note) {
          noteHtml = '<div class="field"><span class="label">Note</span><span class="value">&ldquo;' + escapeHtml(order.customer_note) + "&rdquo;</span></div>";
        }
        return '<div class="sidebar-content"><div class="header"><h2>Shopify Order Data</h2><div class="field"><span class="label">Store</span><span class="value">' + escapeHtml(data.store_name) + '</span></div><div class="field"><span class="label">Customer</span><span class="value">' + escapeHtml((data.customer_emails || [])[0] || "") + "</span></div></div>" + renderOrderSelector(data.orders, order.shopify_order_id) + '<div class="order-details"><div class="field"><span class="label">Status</span><span class="value badge badge-' + escapeHtml(order.order_status) + '">' + escapeHtml(order.order_status) + '</span></div><div class="field"><span class="label">Payment</span><span class="value">' + escapeHtml(order.financial_status) + '</span></div><div class="field"><span class="label">Fulfillment</span><span class="value">' + escapeHtml(order.fulfillment_status) + '</span></div><div class="field"><span class="label">Total</span><span class="value">' + escapeHtml(order.total_price) + " " + escapeHtml(order.currency) + '</span></div><div class="field"><span class="label">Payment Method</span><span class="value">' + escapeHtml(order.payment_method) + '</span></div><div class="field"><span class="label">Date</span><span class="value">' + formatDate(order.created_at) + "</span></div>" + renderTrackingSection(order) + renderLineItems(order.line_items) + shippingHtml + tagsHtml + noteHtml + '</div><div class="actions"><button id="refresh-btn" class="c-btn">Refresh</button><a id="open-shopify" href="' + shopifyUrl + '" target="_blank" rel="noopener" class="c-btn c-btn--primary">Open in Shopify &#x2197;</a></div><div class="last-synced">Last synced: ' + formatTimeAgo(data.last_synced) + "</div></div>";
      }
      module.exports = {
        escapeHtml,
        formatDate,
        formatTimeAgo,
        renderLoading,
        renderError,
        renderNoOrders,
        renderStoreNotConfigured,
        renderOrderSelector,
        renderOrderData
      };
    }
  });

  // src/index.js
  var api = require_api();
  var poller = require_poller();
  var ui = require_ui();
  (function main() {
    if (typeof ZAFClient === "undefined") {
      console.error("ZAFClient not available");
      return;
    }
    var client = ZAFClient.init();
    var container = document.getElementById("app");
    var currentData = null;
    var currentTicketId = null;
    function resizeApp() {
      var height = Math.max(document.body.scrollHeight, 80);
      client.invoke("resize", { width: "100%", height: height + "px" });
    }
    var observer = new MutationObserver(resizeApp);
    observer.observe(container, { childList: true, subtree: true });
    function render(html) {
      container.innerHTML = html;
      resizeApp();
    }
    function renderApp(data) {
      currentData = data;
      if (data.error === "store_not_found" || data.error === "no_store_name") {
        render(ui.renderStoreNotConfigured());
        return;
      }
      if (!data.orders || data.orders.length === 0) {
        render(ui.renderNoOrders());
        attachRefreshHandler();
        return;
      }
      render(ui.renderOrderData(data));
      attachEventHandlers(data);
    }
    function attachEventHandlers(data) {
      attachOrderSelectorHandler(data);
      attachRefreshHandler();
    }
    function attachOrderSelectorHandler(data) {
      var select = document.getElementById("order-select");
      if (!select) return;
      select.addEventListener("change", function(e) {
        var orderId = e.target.value;
        render(ui.renderLoading());
        api.selectOrder(client, currentTicketId, orderId).then(function() {
          data.selected_order_id = orderId;
          renderApp(data);
        }).catch(function() {
          client.invoke("notify", "Failed to switch order", "error");
          renderApp(data);
        });
      });
    }
    function attachRefreshHandler() {
      var refreshBtn = document.getElementById("refresh-btn");
      if (!refreshBtn) return;
      refreshBtn.addEventListener("click", function() {
        loadOrderData(true);
      });
    }
    function loadOrderData(forceRefresh) {
      render(ui.renderLoading());
      client.get("ticket.id").then(function(ticketData) {
        var ticketId = String(ticketData["ticket.id"]);
        currentTicketId = ticketId;
        if (forceRefresh) {
          api.triggerLookup(client, ticketId).then(function(result) {
            if (result.error) {
              render(ui.renderError("Lookup failed: " + result.error));
              attachRefreshHandler();
              return;
            }
            return api.getOrders(client, ticketId);
          }).then(function(data) {
            if (data) renderApp(data);
          }).catch(function() {
            render(ui.renderError("Refresh failed \u2014 try again"));
            attachRefreshHandler();
          });
          return;
        }
        api.getOrders(client, ticketId).then(function(data) {
          renderApp(data);
        }).catch(function(err) {
          if (err && err.status === 404) {
            poller.pollForOrders(
              function() {
                return api.getOrders(client, ticketId);
              },
              { interval: 2e3, maxRetries: 5 }
            ).then(function(data) {
              renderApp(data);
            }).catch(function(pollErr) {
              if (pollErr.message === "max_retries") {
                api.triggerLookup(client, ticketId).then(function() {
                  return api.getOrders(client, ticketId);
                }).then(function(data) {
                  renderApp(data);
                }).catch(function() {
                  render(ui.renderError("Could not fetch order data \u2014 click Refresh"));
                  attachRefreshHandler();
                });
              } else {
                render(ui.renderError("Could not fetch order data \u2014 click Refresh"));
                attachRefreshHandler();
              }
            });
          } else {
            render(ui.renderError("Could not fetch order data \u2014 click Refresh"));
            attachRefreshHandler();
          }
        });
      });
    }
    loadOrderData(false);
  })();
})();
