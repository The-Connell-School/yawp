export function AuthBrandLockup({ partner }: { partner?: 'ua' | null }) {
  if (partner === 'ua') {
    return (
      <div
        className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-6"
        aria-label="The University of Alabama and Yawp"
      >
        <UaNameplate className="max-w-sm" />
        <div className="flex w-full max-w-sm items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-black/10" />
          <span className="text-xl font-light text-muted-foreground">+</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>
        <YawpMark className="w-40 sm:w-48" />
      </div>
    );
  }

  return (
    <img
      src="/img/logo_for_light_mode.png"
      alt="Yawp"
      className="mx-auto h-auto w-48 rounded object-cover sm:w-52"
    />
  );
}

function UaNameplate({ className = '' }: { className?: string }) {
  return (
    <img
      src="/img/partners/university-of-alabama-nameplate.png"
      alt="The University of Alabama"
      className={`h-auto w-full max-w-[26rem] shrink-0 object-contain ${className}`}
    />
  );
}

function YawpMark({ className = 'w-52 sm:w-64' }: { className?: string }) {
  return (
    <img
      src="/img/yawp_black_logo.png"
      alt="Yawp"
      className={`h-auto shrink-0 object-contain ${className}`}
    />
  );
}
