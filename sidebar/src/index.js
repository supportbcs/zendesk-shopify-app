var api = require('./api');
var poller = require('./poller');
var ui = require('./ui');

(function main() {
  // ZAFClient is provided by the ZAF SDK script loaded before this bundle
  if (typeof ZAFClient === 'undefined') {
    console.error('ZAFClient not available');
    return;
  }

  var client = ZAFClient.init();
  var container = document.getElementById('app');
  var currentData = null;
  var currentTicketId = null;

  // Resize app to fit content dynamically
  function resizeApp() {
    var height = Math.max(document.body.scrollHeight, 80);
    client.invoke('resize', { width: '100%', height: height + 'px' });
  }

  // Observe DOM changes to auto-resize
  var observer = new MutationObserver(resizeApp);
  observer.observe(container, { childList: true, subtree: true });

  // -- Rendering helpers --

  function render(html) {
    container.innerHTML = html;
    resizeApp();
  }

  function renderApp(data) {
    currentData = data;

    if (data.error === 'store_not_found' || data.error === 'no_store_name') {
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

  // -- Event handlers --

  function attachEventHandlers(data) {
    attachOrderSelectorHandler(data);
    attachRefreshHandler();
  }

  function attachOrderSelectorHandler(data) {
    var select = document.getElementById('order-select');
    if (!select) return;

    select.addEventListener('change', function (e) {
      var orderId = e.target.value;
      render(ui.renderLoading());

      api.selectOrder(client, currentTicketId, orderId)
        .then(function () {
          data.selected_order_id = orderId;
          renderApp(data);
        })
        .catch(function () {
          client.invoke('notify', 'Failed to switch order', 'error');
          renderApp(data);
        });
    });
  }

  function attachRefreshHandler() {
    var refreshBtn = document.getElementById('refresh-btn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', function () {
      loadOrderData(true);
    });
  }

  // -- Data loading --

  function loadOrderData(forceRefresh) {
    render(ui.renderLoading());

    client.get('ticket.id').then(function (ticketData) {
      var ticketId = String(ticketData['ticket.id']);
      currentTicketId = ticketId;

      if (forceRefresh) {
        // Manual refresh: trigger backend lookup, then fetch cached data
        api.triggerLookup(client, ticketId)
          .then(function (result) {
            if (result.error) {
              render(ui.renderError('Lookup failed: ' + result.error));
              attachRefreshHandler();
              return;
            }
            return api.getOrders(client, ticketId);
          })
          .then(function (data) {
            if (data) renderApp(data);
          })
          .catch(function () {
            render(ui.renderError('Refresh failed — try again'));
            attachRefreshHandler();
          });
        return;
      }

      // Normal load: try cached data, poll if not ready, fallback to live lookup
      api.getOrders(client, ticketId)
        .then(function (data) {
          renderApp(data);
        })
        .catch(function (err) {
          if (err && err.status === 404) {
            // No cached data yet — poll (webhook may still be processing)
            poller.pollForOrders(
              function () { return api.getOrders(client, ticketId); },
              { interval: 2000, maxRetries: 5 }
            )
              .then(function (data) {
                renderApp(data);
              })
              .catch(function (pollErr) {
                if (pollErr.message === 'max_retries') {
                  // Last resort: trigger a live lookup
                  api.triggerLookup(client, ticketId)
                    .then(function () {
                      return api.getOrders(client, ticketId);
                    })
                    .then(function (data) {
                      renderApp(data);
                    })
                    .catch(function () {
                      render(ui.renderError('Could not fetch order data — click Refresh'));
                      attachRefreshHandler();
                    });
                } else {
                  render(ui.renderError('Could not fetch order data — click Refresh'));
                  attachRefreshHandler();
                }
              });
          } else {
            render(ui.renderError('Could not fetch order data — click Refresh'));
            attachRefreshHandler();
          }
        });
    });
  }

  // -- Start --
  loadOrderData(false);
})();
