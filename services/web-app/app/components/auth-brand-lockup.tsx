export function AuthBrandLockup({
  partner,
  prominent = false,
}: {
  partner?: 'ua' | null;
  prominent?: boolean;
}) {
  if (partner === 'ua') {
    return (
      <div
        className={
          prominent
            ? 'mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-7 px-4'
            : 'mx-auto flex max-w-md items-center justify-center gap-4 px-6'
        }
        aria-label="The University of Alabama and Yawp"
      >
        <img
          src="/img/partners/university-of-alabama-nameplate.png"
          alt="The University of Alabama"
          className={
            prominent
              ? 'h-auto w-full max-w-[22rem] object-contain sm:max-w-[26rem]'
              : 'h-7 w-auto max-w-[44%] object-contain sm:h-8'
          }
        />
        <span
          className={
            prominent
              ? 'text-3xl font-light text-muted-foreground'
              : 'text-xl text-muted-foreground'
          }
          aria-hidden="true"
        >
          +
        </span>
        <img
          src="/img/yawp_black_logo.png"
          alt="Yawp"
          className={
            prominent
              ? 'h-auto w-52 object-contain sm:w-64'
              : 'h-7 w-auto max-w-[34%] object-contain sm:h-8'
          }
        />
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
