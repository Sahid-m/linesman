# Live TxLINE + public venue joins

## Goal

After wallet connect + TxLINE activation, Linesman serves real TxLINE sharp lines and real Polymarket/Kalshi prices joined by heuristic name match (plus optional curated `data/market-map.json`). No mock edges while a live activated session is returning odds.

## Surfaces

- Wallet entry: link to existing `/starter` flow (SIWS → subscribe → activate)
- `getLiveSharpLines`: fixtures with 14-day `startEpochDay` lookback
- Auto-map: Polymarket `public-search` + Kalshi `KXWCGAME` series → `MarketMapping[]`
- `getMappedEdges`: curated map ∪ auto-map; Polymarket preferred, Kalshi fallback
- Manager: if live TxLINE available → mode `live` (mapped edges or empty), never mock
- `GET /api/live/lines`: raw `SharpLine[]` for teammates

## Out of scope

Feed card redesign; Kalshi as primary when Polymarket exists; paid venue APIs.
