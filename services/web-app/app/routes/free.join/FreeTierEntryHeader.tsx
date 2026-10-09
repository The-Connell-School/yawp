export function FreeTierEntryHeader(props: { title: string; subtitle?: string; kicker?: string }) {
  return (
    <>
      <a className="yawp-entry-logo" href="/" aria-label="YAWP! home">
        <img src="/img/landing/yawp-logo-circle.jpg" alt="YAWP!" />
      </a>
      <div className="yawp-entry-copy">
        {props.kicker ? <p className="yawp-entry-kicker">{props.kicker}</p> : null}
        <h1>
          {props.title}
          {props.subtitle ? <span>{props.subtitle}</span> : null}
        </h1>
      </div>
    </>
  );
}
