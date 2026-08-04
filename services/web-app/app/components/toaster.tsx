import { useEffect } from 'react';
import { Toaster as SonnerToaster, toast as showToast } from 'sonner';
import { type Toast } from '~/utils/toast.server.ts';

export function Toaster({ toast }: { toast?: Toast | null }) {
  return (
    <>
      <SonnerToaster closeButton position="bottom-right" theme="light" />
      {toast ? <ShowToast toast={toast} /> : null}
    </>
  );
}

function ShowToast({ toast }: { toast: Toast }) {
  const { id, type, title, description, closeButton } = toast;
  useEffect(() => {
    setTimeout(() => {
      showToast[type](title, { id, description, closeButton });
    }, 0);
  }, [description, id, title, type, closeButton]);
  return null;
}
