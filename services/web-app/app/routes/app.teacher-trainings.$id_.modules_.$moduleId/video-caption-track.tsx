export type VideoCaptionTrackConfig = {
  src: string;
  label: string;
  srcLang: string;
};

export function VideoCaptionTrack({
  track,
}: {
  track?: VideoCaptionTrackConfig | null;
}) {
  if (!track) return null;

  return (
    <track
      kind="captions"
      src={track.src}
      srcLang={track.srcLang}
      label={track.label}
      default
    />
  );
}
