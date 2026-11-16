(function (global) {
  'use strict';
  var STORE = 'barnyard-lang';
  var MESSAGES = {
    en: {
      'app.title': 'Barnyard Auction',
      'lang.group': 'Language',
      'lang.en': 'English',
      'lang.es': 'Español',
      'skip.main': 'Skip to main content',
      'auth.tagline': 'Sign in to clerk a youth or county-fair small-animal sale. Your fair or club keeps the sale, on every device you allow.',
      'auth.signIn': 'Sign in',
      'auth.create': 'Create account',
      'auth.email': 'Email',
      'auth.password': 'Password',
      'auth.yourName': 'Your name',
      'auth.fairClub': 'Fair or club',
      'auth.createSubmit': 'Create account',
      'auth.ownerNote': 'You become the owner and can add other clerks.',
      'auth.join': 'Join',
      'auth.inviteFor': 'This invite is for',
      'auth.joinSubmit': 'Join and sign in',
      'auth.backSignIn': 'Back to sign in',
      'auth.legal': 'By using Barnyard Auction you agree to our {terms} and {privacy}.',
      'legal.terms': 'Terms of Service',
      'legal.privacy': 'Privacy Policy',
      'app.tagline': 'Run your small-animal sale from one screen.',
      'sync.saved': 'Saved',
      'sync.saving': 'Saving…',
      'sync.offline': 'Offline — saved on this device',
      'sync.error': 'Not synced — will retry',
      'tot.lots': 'Lots entered',
      'tot.sold': 'Sold',
      'tot.gross': 'Gross sales',
      'tot.addons': 'Add-ons / support',
      'tot.fee': 'Sale fee',
      'tot.avg': 'Avg sale (sold)',
      'tot.avgLb': 'Avg $/lb (sold)',
      'tot.net': 'Net owed exhibitors',
      'payout.boardNote': 'Exhibitor payouts are tracked separately — money is often picked up days after the sale.',
      'nav.people': 'People',
      'nav.signOut': 'Sign out',
      'example.banner': 'Example data',
      'example.body': 'This event is sample seed data so you can try the app. Clear it before your real sale.',
      'example.clear': 'Clear example data',
      'event.choose': 'Choose event',
      'event.new': 'New event',
      'event.rename': 'Rename',
      'event.delete': 'Delete event',
      'theme.toggle': 'Toggle light or dark theme',
      'theme.label': 'Theme',
      'tab.lots': 'Lots',
      'tab.buyers': 'Buyers',
      'tab.payouts': 'Payouts',
      'tab.reports': 'Reports & backup',
      'sec.eventSettings': 'Event settings',
      'sec.fee': 'Commission / sale fee %',
      'sec.saleDate': 'Sale date',
      'sec.payoutDays': 'Payout pickup deadline (days)',
      'sec.feeHint': 'Applied to sale price only (not add-ons). Net = sale − fee + add-ons. Payouts due by sale date + deadline days.',
      'sec.addLot': 'Add a lot',
      'lot.exhibitor': 'Exhibitor',
      'lot.species': 'Species',
      'lot.club': 'Club / chapter (optional)',
      'lot.weight': 'Weight (lbs, optional)',
      'lot.description': 'Description',
      'lot.add': 'Add lot',
      'filter.show': 'Show',
      'filter.all': 'All lots',
      'filter.unsold': 'Unsold',
      'filter.sold': 'Sold',
      'filter.search': 'Search exhibitor or species',
      'filter.searchPh': 'Search…',
      'lots.list': 'Lots in this event',
      'payout.title': 'Exhibitor payouts',
      'payout.print': 'Print payout list',
      'payout.export': 'Export CSV',
      'buyer.balances': 'Buyer balances',
      'buyer.balancesNote': 'Outstanding buyer payments (sale day charges, not exhibitor payouts).',
      'buyer.registry': 'Buyer registry',
      'buyer.num': 'Bidder #',
      'buyer.name': 'Name',
      'buyer.business': 'Business (optional)',
      'buyer.phone': 'Phone (optional)',
      'buyer.add': 'Add buyer',
      'reports.printable': 'Printable reports',
      'reports.invoices': 'Buyer invoices',
      'reports.settlements': 'Exhibitor settlements',
      'reports.bill': 'Sale bill (catalog)',
      'reports.printNote': 'Each buyer invoice prints on its own page. Use your browser’s print dialog.',
      'reports.backup': 'Backup & export',
      'reports.jsonExport': 'Export JSON backup',
      'reports.jsonImport': 'Import JSON…',
      'reports.importDevice': 'Import on-device sales',
      'reports.csv': 'Export CSV',
      'reports.jsonFile': 'Import JSON backup file',
      'footer.syncNote': 'Sales are saved to your fair or club and cached on this device, so a dropped Wi-Fi connection does not stop the sale. The status in the header shows Saved or Offline. Export a JSON backup after a big sale day.',
      'print.buyerInvoice': 'Buyer Invoice',
      'print.settlement': 'Exhibitor Settlement',
      'print.saleBill': 'Sale Bill',
      'print.payoutList': 'Exhibitor Payout List',
      'print.lot': 'Lot',
      'print.description': 'Description',
      'print.amount': 'Amount',
      'print.item': 'Item',
      'print.sale': 'Sale',
      'print.addons': 'Add-ons',
      'print.fee': 'Fee',
      'print.net': 'Net',
      'print.exhibitor': 'Exhibitor',
      'print.club': 'Club',
      'print.species': 'Species',
      'print.weight': 'Wt (lb)',
      'print.price': 'Price',
      'print.buyer': 'Buyer',
      'print.status': 'Status',
      'print.pickupDate': 'Pickup date',
      'print.detail': 'Detail',
      'print.overdue': 'Overdue',
      'print.totalDue': 'Total due'
    },
    es: {
      'app.title': 'Subasta del Corral',
      'lang.group': 'Idioma',
      'lang.en': 'English',
      'lang.es': 'Español',
      'skip.main': 'Saltar al contenido principal',
      'auth.tagline': 'Inicie sesión para registrar una subasta juvenil o de feria de animales pequeños. Su feria o club conserva la venta en cada dispositivo autorizado.',
      'auth.signIn': 'Iniciar sesión',
      'auth.create': 'Crear cuenta',
      'auth.email': 'Correo electrónico',
      'auth.password': 'Contraseña',
      'auth.yourName': 'Su nombre',
      'auth.fairClub': 'Feria o club',
      'auth.createSubmit': 'Crear cuenta',
      'auth.ownerNote': 'Usted será el propietario y podrá agregar otros registradores.',
      'auth.join': 'Unirse a',
      'auth.inviteFor': 'Esta invitación es para',
      'auth.joinSubmit': 'Unirse e iniciar sesión',
      'auth.backSignIn': 'Volver a iniciar sesión',
      'auth.legal': 'Al usar Subasta del Corral acepta nuestros {terms} y {privacy}.',
      'legal.terms': 'Términos de servicio',
      'legal.privacy': 'Política de privacidad',
      'app.tagline': 'Dirija su venta de animales pequeños desde una sola pantalla.',
      'sync.saved': 'Guardado',
      'sync.saving': 'Guardando…',
      'sync.offline': 'Sin conexión — guardado en este dispositivo',
      'sync.error': 'Sin sincronizar — se reintentará',
      'tot.lots': 'Lotes ingresados',
      'tot.sold': 'Vendidos',
      'tot.gross': 'Ventas brutas',
      'tot.addons': 'Aportes / apoyo',
      'tot.fee': 'Comisión de venta',
      'tot.avg': 'Prom. venta (vendidos)',
      'tot.avgLb': 'Prom. $/lb (vendidos)',
      'tot.net': 'Neto a expositores',
      'payout.boardNote': 'Los pagos a expositores se registran por separado; el dinero suele recogerse días después de la venta.',
      'nav.people': 'Personas',
      'nav.signOut': 'Cerrar sesión',
      'example.banner': 'Datos de ejemplo',
      'example.body': 'Este evento es muestra para probar la aplicación. Bórrelo antes de su venta real.',
      'example.clear': 'Borrar datos de ejemplo',
      'event.choose': 'Elegir evento',
      'event.new': 'Nuevo evento',
      'event.rename': 'Renombrar',
      'event.delete': 'Eliminar evento',
      'theme.toggle': 'Cambiar tema claro u oscuro',
      'theme.label': 'Tema',
      'tab.lots': 'Lotes',
      'tab.buyers': 'Compradores',
      'tab.payouts': 'Pagos',
      'tab.reports': 'Informes y copia',
      'sec.eventSettings': 'Ajustes del evento',
      'sec.fee': 'Comisión / % de venta',
      'sec.saleDate': 'Fecha de venta',
      'sec.payoutDays': 'Plazo de recogida de pagos (días)',
      'sec.feeHint': 'Solo sobre el precio de venta (no aportes). Neto = venta − comisión + aportes. Pagos vencen fecha de venta + días de plazo.',
      'sec.addLot': 'Agregar lote',
      'lot.exhibitor': 'Expositor',
      'lot.species': 'Especie',
      'lot.club': 'Club / capítulo (opcional)',
      'lot.weight': 'Peso (lb, opcional)',
      'lot.description': 'Descripción',
      'lot.add': 'Agregar lote',
      'filter.show': 'Mostrar',
      'filter.all': 'Todos los lotes',
      'filter.unsold': 'Sin vender',
      'filter.sold': 'Vendidos',
      'filter.search': 'Buscar expositor o especie',
      'filter.searchPh': 'Buscar…',
      'lots.list': 'Lotes en este evento',
      'payout.title': 'Pagos a expositores',
      'payout.print': 'Imprimir lista de pagos',
      'payout.export': 'Exportar CSV',
      'buyer.balances': 'Saldos de compradores',
      'buyer.balancesNote': 'Pagos pendientes de compradores (cargos del día de venta, no pagos a expositores).',
      'buyer.registry': 'Registro de compradores',
      'buyer.num': 'N.º de postor',
      'buyer.name': 'Nombre',
      'buyer.business': 'Negocio (opcional)',
      'buyer.phone': 'Teléfono (opcional)',
      'buyer.add': 'Agregar comprador',
      'reports.printable': 'Informes imprimibles',
      'reports.invoices': 'Facturas de compradores',
      'reports.settlements': 'Liquidaciones de expositores',
      'reports.bill': 'Catálogo de venta',
      'reports.printNote': 'Cada factura se imprime en su propia página. Use el diálogo de impresión del navegador.',
      'reports.backup': 'Copia de seguridad y exportación',
      'reports.jsonExport': 'Exportar copia JSON',
      'reports.jsonImport': 'Importar JSON…',
      'reports.importDevice': 'Importar ventas del dispositivo',
      'reports.csv': 'Exportar CSV',
      'reports.jsonFile': 'Archivo de copia JSON',
      'footer.syncNote': 'Las ventas se guardan en su feria o club y en caché en este dispositivo; una caída de Wi‑Fi no detiene la venta. El estado en el encabezado muestra Guardado o Sin conexión. Exporte una copia JSON después de un día grande de venta.',
      'print.buyerInvoice': 'Factura del comprador',
      'print.settlement': 'Liquidación del expositor',
      'print.saleBill': 'Catálogo de venta',
      'print.payoutList': 'Lista de pagos a expositores',
      'print.lot': 'Lote',
      'print.description': 'Descripción',
      'print.amount': 'Monto',
      'print.item': 'Artículo',
      'print.sale': 'Venta',
      'print.addons': 'Aportes',
      'print.fee': 'Comisión',
      'print.net': 'Neto',
      'print.exhibitor': 'Expositor',
      'print.club': 'Club',
      'print.species': 'Especie',
      'print.weight': 'Peso (lb)',
      'print.price': 'Precio',
      'print.buyer': 'Comprador',
      'print.status': 'Estado',
      'print.pickupDate': 'Fecha de recogida',
      'print.detail': 'Detalle',
      'print.overdue': 'Vencido',
      'print.totalDue': 'Total adeudado'
    }
  };

  var lang = 'en';

  function detect() {
    try {
      var saved = localStorage.getItem(STORE);
      if (saved === 'en' || saved === 'es') return saved;
    } catch (e) { /* ignore */ }
    var langs = global.navigator && (global.navigator.languages || [global.navigator.language]) || [];
    for (var i = 0; i < langs.length; i++) {
      if (String(langs[i] || '').toLowerCase().indexOf('es') === 0) return 'es';
    }
    return 'en';
  }

  function setLang(next) {
    if (next !== 'en' && next !== 'es') return lang;
    lang = next;
    try { localStorage.setItem(STORE, lang); } catch (e) { /* ignore */ }
    try {
      document.cookie = 'ba_lang=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax';
    } catch (e2) { /* ignore */ }
    return lang;
  }

  function getLang() { return lang; }

  function t(key, vars) {
    var table = MESSAGES[lang] || MESSAGES.en;
    var text = table[key] || MESSAGES.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        text = text.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return text;
  }

  function formatMoney(n) {
    n = Number(n) || 0;
    var loc = lang === 'es' ? 'es-US' : 'en-US';
    var digits = n % 1 ? 2 : 0;
    try {
      return new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      return '$' + n.toFixed(digits);
    }
  }

  function formatDateISO(d) {
    if (!d) return '';
    try {
      var loc = lang === 'es' ? 'es-US' : 'en-US';
      return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
    } catch (e2) {
      return d.toISOString().slice(0, 10);
    }
  }

  function legalPaths() {
    if (lang === 'es') return { privacy: '/privacidad', terms: '/terminos' };
    return { privacy: '/privacy', terms: '/terms' };
  }

  function applyDocument() {
    document.documentElement.lang = lang === 'es' ? 'es' : 'en';
    document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      if (key === 'auth.legal') {
        var paths = legalPaths();
        el.innerHTML = t(key, {
          terms: '<a href="' + paths.terms + '">' + t('legal.terms') + '</a>',
          privacy: '<a href="' + paths.privacy + '">' + t('legal.privacy') + '</a>'
        });
        return;
      }
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('option[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('a[data-i18n-link]').forEach(function (el) {
      var kind = el.getAttribute('data-i18n-link');
      var paths = legalPaths();
      if (kind === 'privacy') el.setAttribute('href', paths.privacy);
      if (kind === 'terms') el.setAttribute('href', paths.terms);
    });
    document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      var on = btn.getAttribute('data-lang-set') === lang;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  lang = detect();
  global.BarnyardI18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    formatMoney: formatMoney,
    formatDateISO: formatDateISO,
    legalPaths: legalPaths,
    applyDocument: applyDocument
  };
})(typeof window !== 'undefined' ? window : globalThis);