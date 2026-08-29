# Feature 102 — tasks

- [x] T101 Masters: coverage-holding (embedding manifest), holdings-inventory,
      holding-published, config.env-generator, config.coverage-store; config.run and
      config.shell extended (holdings view, topic, endpoint)
- [x] T102 Analytic form v1: background profiles, four features, composition rule,
      tau with max-membership blend and anomaly-geometry membership, pressure
      relation, Mackenzie sound speed with validity accounting
- [x] T103 Coverage store: staged digest-checked atomic publication, era pointers,
      announcement on its topic, inventory route, heartbeat with holdings count
- [x] T104 Generator: jitter draws with recorded draw order, archive + now-cast
      authoring through the publication seam, cadence-driven replacement,
      ground-truth manifest to the master
- [x] T105 Holdings panel: inventory through the seam, master-validated, manifest
      inspection; Intro grown by the 102 section
- [x] T106 Tests: analytic properties; manifest validity and sufficiency; FR-13
      refusal watched; cadence; AT-03 descendant with manifest-derived bound;
      AT-04 seed-level byte identity (and its different-seed failure case)
- [ ] T107 Seasonal signal in the archive — *declined for now: the archive is a
      climatology of the same analytic world sampled monthly; a seasonal cycle adds
      a parameter the demo does not yet read. Revisit if 109's map or a blog post
      wants visible seasonality.*
- [x] T108 Holdings' requirement written into SRD-v2 §5.2 as FR-46 (issue #58): the
      inventory through the seam and the gate against a configured path, master-valid
      before display, era/id/instant/grid/digest per row, the manifest openable whole,
      refresh only on the store's announcement and never a poll, and a refusal stated
      rather than an empty store rendered. Two of those claims had no test behind them
      and now do — the announcement-driven refresh with a genuine nowcast replacement,
      and the gate's 403 stated in the tab — watched failing against a planted poll, a
      dropped subscription and a swallowed refusal.
