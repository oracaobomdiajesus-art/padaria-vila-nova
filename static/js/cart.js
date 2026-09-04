(function () {
  var STORAGE_KEY = 'pvn_cart';

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — cart just won't persist
    }
  }

  function formatPrice(value) {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  function cartTotal(cart) {
    return cart.reduce(function (sum, item) {
      return sum + item.preco * item.qty;
    }, 0);
  }

  function addToCart(slug, title, preco) {
    var cart = loadCart();
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].slug === slug) {
        existing = cart[i];
        break;
      }
    }
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ slug: slug, title: title, preco: preco, qty: 1 });
    }
    saveCart(cart);
    renderCart();
  }

  function changeQty(slug, delta) {
    var cart = loadCart();
    var item = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].slug === slug) {
        item = cart[i];
        break;
      }
    }
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(function (i) {
        return i.slug !== slug;
      });
    }
    saveCart(cart);
    renderCart();
  }

  function removeFromCart(slug) {
    var cart = loadCart().filter(function (i) {
      return i.slug !== slug;
    });
    saveCart(cart);
    renderCart();
  }

  function openCart() {
    var panel = document.getElementById('cart-panel');
    var overlay = document.getElementById('cart-overlay');
    if (panel) panel.classList.add('open');
    if (overlay) overlay.hidden = false;
  }

  function closeCart() {
    var panel = document.getElementById('cart-panel');
    var overlay = document.getElementById('cart-overlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.hidden = true;
  }

  function buildMessage(cart, paid) {
    var lines = ['Olá! Gostaria de fazer o seguinte pedido:', ''];
    cart.forEach(function (item) {
      lines.push('- ' + item.qty + 'x ' + item.title + ' (' + formatPrice(item.preco * item.qty) + ')');
    });
    lines.push('');
    lines.push('Subtotal: ' + formatPrice(cartTotal(cart)));
    if (paid) {
      lines.push('');
      lines.push('Já paguei via Pix — vou enviar o comprovante aqui no chat.');
    }
    return lines.join('\n');
  }

  function updateCheckoutLinks() {
    var app = document.getElementById('cart-app');
    var sendBtn = document.getElementById('btn-send-order');
    var paidBtn = document.getElementById('btn-send-paid');
    if (!app) return;

    var cart = loadCart();
    var waNumber = app.dataset.waNumber;
    var disabled = cart.length === 0;

    [sendBtn, paidBtn].forEach(function (btn) {
      if (btn) btn.disabled = disabled;
    });

    if (!waNumber) return;

    if (sendBtn) {
      sendBtn.onclick = function () {
        var msg = buildMessage(loadCart(), false);
        window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg), '_blank');
      };
    }
    if (paidBtn) {
      paidBtn.onclick = function () {
        var msg = buildMessage(loadCart(), true);
        window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg), '_blank');
      };
    }
  }

  function renderCart() {
    var cart = loadCart();
    var badge = document.getElementById('cart-badge');
    var itemsEl = document.getElementById('cart-items');
    var totalEl = document.getElementById('cart-total');
    var emptyEl = document.getElementById('cart-empty');
    if (!itemsEl) return;

    var count = cart.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }

    itemsEl.innerHTML = '';
    if (cart.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
    } else {
      if (emptyEl) emptyEl.hidden = true;
      cart.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'cart-item';

        var name = document.createElement('span');
        name.className = 'cart-item-name';
        name.textContent = item.title;

        var controls = document.createElement('div');
        controls.className = 'cart-item-controls';

        var decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'qty-btn';
        decBtn.textContent = '-';
        decBtn.setAttribute('aria-label', 'Diminuir quantidade');
        decBtn.addEventListener('click', function () {
          changeQty(item.slug, -1);
        });

        var qtySpan = document.createElement('span');
        qtySpan.className = 'cart-item-qty';
        qtySpan.textContent = item.qty;

        var incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'qty-btn';
        incBtn.textContent = '+';
        incBtn.setAttribute('aria-label', 'Aumentar quantidade');
        incBtn.addEventListener('click', function () {
          changeQty(item.slug, 1);
        });

        controls.appendChild(decBtn);
        controls.appendChild(qtySpan);
        controls.appendChild(incBtn);

        var subtotal = document.createElement('span');
        subtotal.className = 'cart-item-subtotal';
        subtotal.textContent = formatPrice(item.preco * item.qty);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.setAttribute('aria-label', 'Remover item');
        removeBtn.addEventListener('click', function () {
          removeFromCart(item.slug);
        });

        row.appendChild(name);
        row.appendChild(controls);
        row.appendChild(subtotal);
        row.appendChild(removeBtn);
        itemsEl.appendChild(row);
      });
    }

    if (totalEl) totalEl.textContent = formatPrice(cartTotal(cart));
    updateCheckoutLinks();
  }

  function setupPixCopy() {
    var btn = document.getElementById('pix-copy-btn');
    var app = document.getElementById('cart-app');
    if (!btn || !app) return;
    var key = app.dataset.pixKey;
    btn.addEventListener('click', function () {
      var done = function () {
        var original = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(function () {
          btn.textContent = original;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(done).catch(function () {
          window.prompt('Copie a chave Pix:', key);
        });
      } else {
        window.prompt('Copie a chave Pix:', key);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderCart();
    setupPixCopy();

    var addButtons = document.querySelectorAll('.btn-add-cart');
    addButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        addToCart(btn.dataset.slug, btn.dataset.title, parseFloat(btn.dataset.preco));
      });
    });

    var cartToggle = document.getElementById('cart-toggle');
    if (cartToggle) cartToggle.addEventListener('click', openCart);

    var cartClose = document.getElementById('cart-close');
    if (cartClose) cartClose.addEventListener('click', closeCart);

    var overlay = document.getElementById('cart-overlay');
    if (overlay) overlay.addEventListener('click', closeCart);
  });
})();
