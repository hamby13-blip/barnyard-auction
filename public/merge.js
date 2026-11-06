/* Lot-level merge for two copies of the same sale.
   Lots and buyers are last-write-wins by touchedAt.
   A tombstone removes a record only when deletedAt is at least that record's touchedAt.
   Event name, fee, and example flag follow metaTouchedAt.
   Lot order follows orderTouchedAt; lots the other clerk added are appended. */
(function (root) {
  function num(n) {
    n = Number(n);
    return Number.isFinite(n) ? n : 0;
  }

  function mergeTombs(a, b) {
    var map = new Map();
    function take(list) {
      (list || []).forEach(function (t) {
        if (!t || t.id == null || t.id === '') return;
        var id = String(t.id);
        var at = num(t.deletedAt);
        if (!map.has(id) || at >= map.get(id)) map.set(id, at);
      });
    }
    take(a);
    take(b);
    return map;
  }

  function mergeById(localList, remoteList, tombs) {
    var map = new Map();
    function take(list) {
      (list || []).forEach(function (item) {
        if (!item || item.id == null || item.id === '') return;
        var id = String(item.id);
        var prev = map.get(id);
        if (!prev || num(item.touchedAt) >= num(prev.touchedAt)) map.set(id, item);
      });
    }
    take(remoteList);
    take(localList);
    tombs.forEach(function (deletedAt, id) {
      var item = map.get(id);
      if (item && deletedAt >= num(item.touchedAt)) map.delete(id);
    });
    return map;
  }

  function mergeEvents(local, remote) {
    local = local || {};
    remote = remote || {};
    var metaLocal = num(local.metaTouchedAt);
    var metaRemote = num(remote.metaTouchedAt);
    var localMetaWins = metaLocal >= metaRemote;
    var lotTombs = mergeTombs(local.lotTombstones, remote.lotTombstones);
    var buyerTombs = mergeTombs(local.buyerTombstones, remote.buyerTombstones);
    var lots = mergeById(local.lots, remote.lots, lotTombs);
    var buyers = mergeById(local.buyers, remote.buyers, buyerTombs);

    var orderFrom = num(local.orderTouchedAt) >= num(remote.orderTouchedAt)
      ? (local.lots || [])
      : (remote.lots || []);
    var ordered = [];
    var seen = {};
    orderFrom.forEach(function (l) {
      if (!l || l.id == null) return;
      var id = String(l.id);
      if (lots.has(id) && !seen[id]) {
        ordered.push(lots.get(id));
        seen[id] = true;
      }
    });
    var rest = [];
    lots.forEach(function (l, id) {
      if (!seen[id]) rest.push(l);
    });
    rest.sort(function (a, b) {
      return num(a.n) - num(b.n) || String(a.id).localeCompare(String(b.id));
    });
    ordered = ordered.concat(rest);

    var buyerList = [];
    buyers.forEach(function (b) { buyerList.push(b); });
    buyerList.sort(function (a, b) {
      return num(a.num) - num(b.num) || String(a.id).localeCompare(String(b.id));
    });

    var lotTombstones = [];
    lotTombs.forEach(function (deletedAt, id) {
      lotTombstones.push({ id: id, deletedAt: deletedAt });
    });
    var buyerTombstones = [];
    buyerTombs.forEach(function (deletedAt, id) {
      buyerTombstones.push({ id: id, deletedAt: deletedAt });
    });

    return {
      id: local.id || remote.id,
      name: localMetaWins ? (local.name || '') : (remote.name || ''),
      feePct: localMetaWins ? num(local.feePct) : num(remote.feePct),
      isExample: !!(localMetaWins ? local.isExample : remote.isExample),
      metaTouchedAt: Math.max(metaLocal, metaRemote),
      orderTouchedAt: Math.max(num(local.orderTouchedAt), num(remote.orderTouchedAt)),
      buyers: buyerList,
      lots: ordered,
      lotTombstones: lotTombstones,
      buyerTombstones: buyerTombstones
    };
  }

  root.BarnyardMerge = { mergeEvents: mergeEvents };
})(typeof globalThis !== 'undefined' ? globalThis : this);
