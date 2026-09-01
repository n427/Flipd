export function WantedDetailSkeleton() {
  return (
    <main className="wanted-detail wanted-detail-skeleton" aria-busy="true">
      <span className="wanted-skeleton-line wanted-skeleton-line--back" />
      <div className="wanted-detail__layout">
        <section>
          <div className="wanted-skeleton-photo" />
          <span className="wanted-skeleton-line wanted-skeleton-line--title" />
          <span className="wanted-skeleton-line wanted-skeleton-line--meta" />
          <span className="wanted-skeleton-line wanted-skeleton-line--body" />
          <span className="wanted-skeleton-line wanted-skeleton-line--body-short" />
        </section>
        <aside><WantedOfferSkeleton /></aside>
      </div>
    </main>
  );
}

export function WantedOfferSkeleton() {
  return (
    <div className="wanted-action-card wanted-offer-skeleton" aria-busy="true">
      <span className="wanted-skeleton-line wanted-skeleton-line--panel-title" />
      <span className="wanted-skeleton-line wanted-skeleton-line--body" />
      <span className="wanted-skeleton-button" />
    </div>
  );
}

export function WantedEditorSkeleton() {
  return (
    <main className="wanted-editor wanted-editor-skeleton" aria-busy="true">
      <div className="wanted-editor-skeleton__head"><span className="wanted-skeleton-line wanted-skeleton-line--title" /><span className="wanted-skeleton-button wanted-skeleton-button--small" /></div>
      <div className="wanted-editor-skeleton__grid">
        <div className="wanted-skeleton-photo" />
        <div>{[0, 1, 2, 3].map((item) => <span key={item} className="wanted-skeleton-field" />)}</div>
      </div>
    </main>
  );
}
