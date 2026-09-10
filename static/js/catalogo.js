(function () {
  var input = document.getElementById('catalogo-busca');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.cat-tab'));
  var grupos = Array.prototype.slice.call(document.querySelectorAll('.categoria-group'));
  var vazioMsg = document.getElementById('busca-vazio');

  if (!input && !tabs.length) return;

  var categoriaAtiva = '';

  function normalizar(texto) {
    return (texto || '').toLowerCase();
  }

  function aplicarFiltro() {
    var termo = normalizar(input ? input.value : '').trim();
    var algumVisivel = false;

    grupos.forEach(function (grupo) {
      var pertenceCategoria = !categoriaAtiva || grupo.dataset.categoria === categoriaAtiva;
      var cards = grupo.querySelectorAll('.product-card');
      var temResultado = false;

      cards.forEach(function (card) {
        var texto = normalizar(card.dataset.busca);
        var combina = pertenceCategoria && (!termo || texto.indexOf(termo) !== -1);
        card.hidden = !combina;
        if (combina) temResultado = true;
      });

      grupo.hidden = !temResultado;
      if (temResultado) algumVisivel = true;
    });

    if (vazioMsg) vazioMsg.hidden = algumVisivel;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      categoriaAtiva = tab.dataset.categoria;
      tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      aplicarFiltro();
    });
  });

  if (input) {
    input.addEventListener('input', aplicarFiltro);
  }

  aplicarFiltro();
})();
