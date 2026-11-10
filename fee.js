// AppShuk fee (written by build.mjs from apps.json site.fee_percent / card_fee_percent / card_fee_cents / min_price; edit those, not this).
// AppShuk keeps 15% of each one-time sale; Stripe's card processing fee (2.9% + 30¢) is paid by the maker on top.
(function (root) {
  var FEE_PERCENT = 15, CARD_FEE_PERCENT = 2.9, CARD_FEE_CENTS = 30, MIN_PRICE = 1.99;
  var NET_BP = 8210; // maker's share before the fixed card fee, in basis points
  function cents(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : NaN; }
  // What the maker receives: price - 15% - (2.9% + 30c), rounded DOWN to the cent (integer math, so 14.99 -> 12.00 exactly).
  function receive(price) { var c = cents(price); if (!(c > 0)) return 0; return Math.max(0, Math.floor((c * NET_BP - CARD_FEE_CENTS * 10000) / 10000)) / 100; }
  function validPrice(price) { var c = cents(price); return c >= Math.round(MIN_PRICE * 100); }
  var api = { FEE_PERCENT: FEE_PERCENT, CARD_FEE_PERCENT: CARD_FEE_PERCENT, CARD_FEE_CENTS: CARD_FEE_CENTS, MIN_PRICE: MIN_PRICE, receive: receive, validPrice: validPrice };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AppShukFee = api;
})(this);
