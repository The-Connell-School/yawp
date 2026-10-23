import { useOutletContext } from 'react-router';

export type FreeTierAdminLayoutContext = {
  adminCopyPass1: boolean;
};

export function useAdminCopyPass1() {
  return (
    useOutletContext<FreeTierAdminLayoutContext>()?.adminCopyPass1 ?? false
  );
}
