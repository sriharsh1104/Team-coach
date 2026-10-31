import { useEffect, useState } from 'react';
import {
  allDropsForMap,
  DropPoint,
  getDropPool,
} from './home/dropPoints';
import { FREE_FIRE_MAPS, FreeFireMap } from './home/freeFireMaps';

type ViewerTarget =
  | { kind: 'overview'; map: FreeFireMap }
  | { kind: 'drop'; map: FreeFireMap; drop: DropPoint };

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

function DropThumb({
  drop,
  onOpen,
}: {
  drop: DropPoint;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="drop-thumb"
      onClick={onOpen}
      aria-label={`Open ${drop.name} drone view`}
    >
      <span className={`drop-tier-badge drop-tier-${drop.tier}`}>
        {drop.tier === 'primary' ? 'Primary' : 'Secondary'}
      </span>
      <div className="drop-thumb-frame">
        <img src={drop.image} alt={`${drop.name} drone view`} loading="lazy" />
      </div>
      <strong>{drop.name}</strong>
      <span>{drop.note}</span>
    </button>
  );
}

export function MapsPage() {
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [zoom, setZoom] = useState(1);

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
    setViewer({ kind: 'overview', map });
  };

  const openDrop = (map: FreeFireMap, drop: DropPoint) => {
    setZoom(1);
    setViewer({ kind: 'drop', map, drop });
  };

  const viewerTitle =
    viewer?.kind === 'drop'
      ? `${viewer.drop.name} · ${viewer.map.name}`
      : viewer
        ? `${viewer.map.name} overview`
        : '';

  const viewerSrc =
    viewer?.kind === 'drop' ? viewer.drop.image : viewer?.map.image ?? '';

  const viewerNote =
    viewer?.kind === 'drop'
      ? `${viewer.drop.tier === 'primary' ? 'Primary' : 'Secondary'} team drop · drone view · zoom for clash landing`
      : 'Full overview · scroll to pan · zoom for drop / rotation plans';

  const viewerDrops = viewer ? allDropsForMap(viewer.map.id) : [];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Free Fire Maps</h1>
          <p>
            Team drop points — primary &amp; secondary per map, drone views for
            clash landing
          </p>
        </div>
      </div>
      <div className="content maps-page">
        {FREE_FIRE_MAPS.map((map, index) => {
          const pool = getDropPool(map.id);
          return (
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
                  src={map.image}
                  alt={`${map.name} full overview`}
                  fallbackId={map.id}
                  fallbackName={map.name}
                />
              </button>

              {pool ? (
                <section className="drop-section">
                  <div className="drop-section-head">
                    <div>
                      <p className="drop-eyebrow">Sacred drops</p>
                      <h3>Primary &amp; secondary</h3>
                    </div>
                    <span className="drop-count">2</span>
                  </div>
                  <div className="drop-grid drop-grid-pair">
                    <DropThumb
                      drop={pool.primary}
                      onOpen={() => openDrop(map, pool.primary)}
                    />
                    <DropThumb
                      drop={pool.secondary}
                      onOpen={() => openDrop(map, pool.secondary)}
                    />
                  </div>
                </section>
              ) : null}
            </article>
          );
        })}
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

              <div className="map-rail-list">
                {viewerDrops.map((drop) => {
                  const active =
                    viewer.kind === 'drop' && viewer.drop.id === drop.id;
                  return (
                    <button
                      key={drop.id}
                      type="button"
                      className={`map-rail-item${active ? ' active' : ''}`}
                      onClick={() => {
                        setZoom(1);
                        setViewer({ kind: 'drop', map: viewer.map, drop });
                      }}
                    >
                      <span className={`drop-tier-badge drop-tier-${drop.tier}`}>
                        {drop.tier === 'primary' ? 'P' : 'S'}
                      </span>
                      <span className="map-rail-label">{drop.name}</span>
                      <span className="map-rail-note">{drop.note}</span>
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
                <MapImage
                  src={viewerSrc}
                  alt={viewerTitle}
                  className={
                    viewer.kind === 'drop'
                      ? 'map-frame-fullscreen map-frame-drone'
                      : 'map-frame-fullscreen'
                  }
                  fallbackId={viewer.map.id}
                  fallbackName={
                    viewer.kind === 'drop' ? viewer.drop.name : viewer.map.name
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
