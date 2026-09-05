(function () {
  var input = document.getElementById('catalogo-busca');
  var btnToggle = document.getElementById('btn-abrir-todas');
  var grupos = Array.prototype.slice.call(document.querySelectorAll('.categoria-group'));
  var vazioMsg = document.getElementById('busca-vazio');

  if (!input && !btnToggle) return;

  function normalizar(texto) {
    return (texto || '').toLowerCase();
  }

  function aplicarFiltro() {
    var termo = normalizar(input ? input.value : '').trim();
    var algumVisivel = false;

    grupos.forEach(function (grupo) {
      var cards = grupo.querySelectorAll('.product-card');
      var temResultado = false;

      cards.forEach(function (card) {
        var texto = normalizar(card.dataset.busca);
        var combina = !termo || texto.indexOf(termo) !== -1;
        card.hidden = !combina;
        if (combina) temResultado = true;
      });

      grupo.hidden = termo !== '' && !temResultado;
      if (termo !== '') {
        grupo.open = temResultado;
      }
      if (temResultado) algumVisivel = true;
    });

    if (vazioMsg) vazioMsg.hidden = !(termo !== '' && !algumVisivel);
  }

  if (input) {
    input.addEventListener('input', aplicarFiltro);
  }

  if (btnToggle) {
    btnToggle.addEventListener('click', function () {
      var vaiAbrir = btnToggle.dataset.state !== 'open';
      grupos.forEach(function (grupo) {
        if (!grupo.hidden) grupo.open = vaiAbrir;
      });
      btnToggle.dataset.state = vaiAbrir ? 'open' : 'closed';
      btnToggle.textContent = vaiAbrir ? 'Fechar todas' : 'Abrir todas';
    });
  }
})();
