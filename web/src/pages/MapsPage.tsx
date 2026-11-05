import { useEffect, useMemo, useState } from 'react';
import { FreeFireMap, MapPin, listMaps, mapPins } from '../api/maps';
import { SesLoader } from '../ui/SesLoader';

type ViewerTarget =
  | { kind: 'overview'; map: FreeFireMap }
  | { kind: 'poi'; map: FreeFireMap; pin: MapPin };

type PinFilter = 'all' | 'drop' | 'vending_machine';

const PIN_FILTERS: { key: PinFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drop', label: 'Drops' },
  { key: 'vending_machine', label: 'Vending' },
];

function pinLabel(pin: MapPin): string {
  if (pin.category === 'drop') {
    return pin.tier === 'primary' ? 'Primary drop' : 'Secondary drop';
  }
  return 'Vending machine';
}

function pinGlyph(pin: MapPin): string {
  if (pin.category === 'drop') return pin.tier === 'primary' ? 'P' : 'S';
  return 'V';
}

function MapImage({
  src,
  alt,
  className,
  fallbackId,
  fallbackName,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackId: string;
  fallbackName: string;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div className={`map-frame${className ? ` ${className}` : ''}`}>
      {!broken ? (
        <img src={src} alt={alt} onError={() => setBroken(true)} />
      ) : (
        <div className={`map-art-fallback map-art-${fallbackId}`} aria-hidden="true">
          <span className="map-art-glyph">{fallbackName.slice(0, 1)}</span>
          <span className="map-art-title">{fallbackName}</span>
        </div>
      )}
    </div>
  );
}

function PinThumb({ pin, onOpen }: { pin: MapPin; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="drop-thumb"
      onClick={onOpen}
      aria-label={`Open ${pin.name}`}
    >
      <span
        className={`drop-tier-badge ${
          pin.category === 'drop'
            ? `drop-tier-${pin.tier}`
            : 'drop-tier-vending'
        }`}
      >
        {pin.category === 'drop'
          ? pin.tier === 'primary'
            ? 'Primary'
            : 'Secondary'
          : 'Vending'}
      </span>
      <div className="drop-thumb-frame">
        <img src={pin.imageUrl} alt={pinLabel(pin)} loading="lazy" />
      </div>
      <strong>{pin.name}</strong>
      <span>{pin.note}</span>
    </button>
  );
}

export function MapsPage() {
  const [maps, setMaps] = useState<FreeFireMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pinFilter, setPinFilter] = useState<PinFilter>('all');

  useEffect(() => {
    let cancelled = false;
    listMaps()
      .then((next) => {
        if (!cancelled) setMaps(next);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load maps from the server');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!viewer) {
      setZoom(1);
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(1, z - 0.25));
      if (e.key === '0') setZoom(1);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [viewer]);

  const openOverview = (map: FreeFireMap) => {
    setZoom(1);
    setPinFilter('all');
    setViewer({ kind: 'overview', map });
  };

  const openPoi = (map: FreeFireMap, pin: MapPin) => {
    setZoom(1);
    setViewer({ kind: 'poi', map, pin });
  };

  const pins = useMemo(() => (viewer ? mapPins(viewer.map) : []), [viewer]);

  const visiblePins = useMemo(
    () =>
      pinFilter === 'all' ? pins : pins.filter((pin) => pin.category === pinFilter),
    [pins, pinFilter],
  );

  const viewerTitle =
    viewer?.kind === 'poi'
      ? `${viewer.pin.name} · ${viewer.map.name}`
      : viewer
        ? `${viewer.map.name} overview`
        : '';

  const viewerSrc =
    viewer?.kind === 'poi' ? viewer.pin.imageUrl : viewer?.map.imageUrl ?? '';

  const viewerNote =
    viewer?.kind === 'poi'
      ? `${pinLabel(viewer.pin)} · drone view · zoom for clash landing`
      : 'Full overview · tap a pin to open that location · zoom for drop / rotation plans';

  if (loading) return <SesLoader label="Loading maps" />;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Free Fire Maps</h1>
          <p>
            Team drop points &amp; vending machines — tap a pin on the map for
            that location&rsquo;s drone view
          </p>
        </div>
      </div>
      <div className="content maps-page">
        {error ? <p className="error">{error}</p> : null}
        {maps.map((map, index) => (
          <article key={map.id} className="map-block">
            <header className="map-block-head">
              <span className="list-sno">{index + 1}</span>
              <div>
                <strong>{map.name}</strong>
                <span>
                  {map.theme}
                  {map.size ? ` · ${map.size}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost map-fullscreen-btn"
                onClick={() => openOverview(map)}
              >
                Full screen overview
              </button>
            </header>

            <button
              type="button"
              className="map-card-preview map-block-overview"
              onClick={() => openOverview(map)}
              aria-label={`Open ${map.name} full screen overview`}
            >
              <MapImage
                src={map.imageUrl}
                alt={`${map.name} full overview`}
                fallbackId={map.id}
                fallbackName={map.name}
              />
            </button>

            <section className="drop-section">
              <div className="drop-section-head">
                <div>
                  <p className="drop-eyebrow">Sacred drops</p>
                  <h3>Primary &amp; secondary</h3>
                </div>
                <span className="drop-count">2</span>
              </div>
              <div className="drop-grid drop-grid-pair">
                <PinThumb
                  pin={{ ...map.primary, category: 'drop' }}
                  onOpen={() => openPoi(map, { ...map.primary, category: 'drop' })}
                />
                <PinThumb
                  pin={{ ...map.secondary, category: 'drop' }}
                  onOpen={() => openPoi(map, { ...map.secondary, category: 'drop' })}
                />
              </div>
            </section>

            {map.vendingMachines.length > 0 ? (
              <section className="drop-section">
                <div className="drop-section-head">
                  <div>
                    <p className="drop-eyebrow">Vending machines</p>
                    <h3>On this map</h3>
                  </div>
                  <span className="drop-count">{map.vendingMachines.length}</span>
                </div>
                <div className="drop-grid">
                  {map.vendingMachines.map((machine) => (
                    <PinThumb
                      key={machine.id}
                      pin={{ ...machine, category: 'vending_machine' }}
                      onOpen={() =>
                        openPoi(map, { ...machine, category: 'vending_machine' })
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        ))}
      </div>

      {viewer ? (
        <div
          className="map-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label={viewerTitle}
        >
          <div className="map-fullscreen-bar">
            <div>
              <h2>{viewerTitle}</h2>
              <p>{viewerNote}</p>
            </div>
            <div className="map-zoom-controls">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                disabled={zoom <= 1}
              >
                −
              </button>
              <span className="map-zoom-label">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                disabled={zoom >= 4}
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setZoom(1)}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-primary topbar-add-btn"
                onClick={() => setViewer(null)}
              >
                Close
              </button>
            </div>
          </div>

          <div className="map-fullscreen-body">
            <aside className="map-viewer-rail" aria-label="Map locations">
              <button
                type="button"
                className={`map-rail-item map-rail-overview${viewer.kind === 'overview' ? ' active' : ''}`}
                onClick={() => {
                  setZoom(1);
                  setViewer({ kind: 'overview', map: viewer.map });
                }}
              >
                <span className="map-rail-label">Overview</span>
                <span className="map-rail-note">Full map</span>
              </button>

              {viewer.kind === 'overview' ? (
                <div className="map-filter-row">
                  {PIN_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`map-filter-chip${pinFilter === filter.key ? ' active' : ''}`}
                      onClick={() => setPinFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="map-rail-list">
                {pins.map((pin) => {
                  const active = viewer.kind === 'poi' && viewer.pin.id === pin.id;
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      className={`map-rail-item${active ? ' active' : ''}`}
                      onClick={() => openPoi(viewer.map, pin)}
                    >
                      <span
                        className={`drop-tier-badge ${
                          pin.category === 'drop'
                            ? `drop-tier-${pin.tier}`
                            : 'drop-tier-vending'
                        }`}
                      >
                        {pinGlyph(pin)}
                      </span>
                      <span className="map-rail-label">{pin.name}</span>
                      <span className="map-rail-note">{pinLabel(pin)}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="map-fullscreen-stage">
              <div
                className="map-zoom-surface"
                style={{
                  width: `${zoom * 100}%`,
                  height: `${zoom * 100}%`,
                  minWidth: '100%',
                  minHeight: '100%',
                }}
              >
                {viewer.kind === 'overview' ? (
                  <div className="map-overview-pins">
                    <MapImage
                      src={viewerSrc}
                      alt={viewerTitle}
                      className="map-frame-fullscreen"
                      fallbackId={viewer.map.id}
                      fallbackName={viewer.map.name}
                    />
                    {visiblePins.map((pin) => (
                      <button
                        key={pin.id}
                        type="button"
                        className={`map-pin ${
                          pin.category === 'vending_machine'
                            ? 'map-pin-vending'
                            : pin.tier === 'secondary'
                              ? 'map-pin-secondary'
                              : 'map-pin-primary'
                        }`}
                        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                        onClick={() => openPoi(viewer.map, pin)}
                        aria-label={`Open ${pin.name}`}
                        title={pin.name}
                      >
                        {pinGlyph(pin)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <MapImage
                    src={viewerSrc}
                    alt={viewerTitle}
                    className="map-frame-fullscreen map-frame-drone"
                    fallbackId={viewer.map.id}
                    fallbackName={viewer.kind === 'poi' ? viewer.pin.name : viewer.map.name}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
