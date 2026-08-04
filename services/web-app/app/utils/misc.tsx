import { useFormAction, useNavigation } from 'react-router';
import { clsx, type ClassValue } from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpinDelay } from 'spin-delay';
import { twMerge } from 'tailwind-merge';

export const DEFAULT_ROUTE = '/app';

export function getUserImgSrc(imageId: string) {
  return `/api/image/user/${imageId}`;
}

export function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  // eslint-disable-next-line no-console
  console.error('Unable to get error message for error', error);
  return 'Unknown Error';
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDomainUrl(request: Request) {
  const host =
    request.headers.get('X-Forwarded-Host') ??
    request.headers.get('host') ??
    new URL(request.url).host;
  const isLocalHost =
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('0.0.0.0');
  const protocol = isLocalHost ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export function getReferrerRoute(request: Request) {
  // spelling errors and whatever makes this annoyingly inconsistent
  // in my own testing, `referer` returned the right value, but 🤷‍♂️
  const referrer =
    request.headers.get('referer') ??
    request.headers.get('referrer') ??
    request.referrer;
  const domain = getDomainUrl(request);
  if (referrer?.startsWith(domain)) {
    return referrer.slice(domain.length);
  } else {
    return '/';
  }
}

/**
 * Merge multiple headers objects into one (uses set so headers are overridden)
 */
export function mergeHeaders(
  ...headers: Array<ResponseInit['headers'] | null | undefined>
) {
  const merged = new Headers();
  for (const header of headers) {
    if (!header) continue;
    for (const [key, value] of new Headers(header).entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

/**
 * Combine multiple header objects into one (uses append so headers are not overridden)
 */
export function combineHeaders(
  ...headers: Array<ResponseInit['headers'] | null | undefined>
) {
  const combined = new Headers();
  for (const header of headers) {
    if (!header) continue;
    for (const [key, value] of new Headers(header).entries()) {
      combined.append(key, value);
    }
  }
  return combined;
}

/**
 * Combine multiple response init objects into one (uses combineHeaders)
 */
export function combineResponseInits(
  ...responseInits: Array<ResponseInit | null | undefined>
) {
  let combined: ResponseInit = {};
  for (const responseInit of responseInits) {
    combined = {
      ...responseInit,
      headers: combineHeaders(combined.headers, responseInit?.headers),
    };
  }
  return combined;
}

/**
 * Returns true if the current navigation is submitting the current route's
 * form. Defaults to the current route's form action and method POST.
 *
 * Defaults state to 'non-idle'
 *
 * NOTE: the default formAction will include query params, but the
 * navigation.formAction will not, so don't use the default formAction if you
 * want to know if a form is submitting without specific query params.
 */
export function useIsPending({
  formAction,
  formMethod = 'POST',
  state = 'non-idle',
}: {
  formAction?: string;
  formMethod?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
  state?: 'submitting' | 'loading' | 'non-idle';
} = {}) {
  const contextualFormAction = useFormAction();
  const navigation = useNavigation();
  const isPendingState =
    state === 'non-idle'
      ? navigation.state !== 'idle'
      : navigation.state === state;
  return (
    isPendingState &&
    navigation.formAction === (formAction ?? contextualFormAction) &&
    navigation.formMethod === formMethod
  );
}

/**
 * This combines useSpinDelay (from https://npm.im/spin-delay) and useIsPending
 * from our own utilities to give you a nice way to show a loading spinner for
 * a minimum amount of time, even if the request finishes right after the delay.
 *
 * This avoids a flash of loading state regardless of how fast or slow the
 * request is.
 */
export function useDelayedIsPending({
  formAction,
  formMethod,
  delay = 400,
  minDuration = 300,
}: Parameters<typeof useIsPending>[0] &
  Parameters<typeof useSpinDelay>[1] = {}) {
  const isPending = useIsPending({ formAction, formMethod });
  const delayedIsPending = useSpinDelay(isPending, {
    delay,
    minDuration,
  });
  return delayedIsPending;
}

function callAll<Args extends Array<unknown>>(
  ...fns: Array<((...args: Args) => unknown) | undefined>
) {
  return (...args: Args) => fns.forEach((fn) => fn?.(...args));
}

/**
 * Use this hook with a button and it will make it so the first click sets a
 * `doubleCheck` state to true, and the second click will actually trigger the
 * `onClick` handler. This allows you to have a button that can be like a
 * "are you sure?" experience for the user before doing destructive operations.
 */
export function useDoubleCheck() {
  const [doubleCheck, setDoubleCheck] = useState(false);

  function getButtonProps(
    props?: React.ButtonHTMLAttributes<HTMLButtonElement>
  ) {
    const onBlur: React.ButtonHTMLAttributes<HTMLButtonElement>['onBlur'] =
      () => setDoubleCheck(false);

    const onClick: React.ButtonHTMLAttributes<HTMLButtonElement>['onClick'] =
      doubleCheck
        ? undefined
        : (e) => {
            e.preventDefault();
            setDoubleCheck(true);
          };

    const onKeyUp: React.ButtonHTMLAttributes<HTMLButtonElement>['onKeyUp'] = (
      e
    ) => {
      if (e.key === 'Escape') {
        setDoubleCheck(false);
      }
    };

    return {
      ...props,
      onBlur: callAll(onBlur, props?.onBlur),
      onClick: callAll(onClick, props?.onClick),
      onKeyUp: callAll(onKeyUp, props?.onKeyUp),
    };
  }

  return { doubleCheck, getButtonProps };
}

/**
 * Simple debounce implementation
 */
function debounce<Callback extends (...args: Parameters<Callback>) => void>(
  fn: Callback,
  delay: number
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<Callback>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Debounce a callback function
 */
export function useDebounce<
  Callback extends (...args: Parameters<Callback>) => ReturnType<Callback>,
>(callback: Callback, delay: number) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  return useMemo(
    () =>
      debounce(
        (...args: Parameters<Callback>) => callbackRef.current(...args),
        delay
      ),
    [delay]
  );
}

export async function downloadFile(url: string, retries: number = 0) {
  const MAX_RETRIES = 3;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image with status ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpg';
    const blob = Buffer.from(await response.arrayBuffer());
    return { contentType, blob };
  } catch (e) {
    if (retries > MAX_RETRIES) throw e;
    return downloadFile(url, retries + 1);
  }
}

export const toArray = (value: string | (string | undefined)[] | undefined) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value) {
    return [value];
  }
  return [];
};

export function parseAIResponse(text: string): React.ReactNode {
  // Split the text into items based on the numbering pattern
  const items = text.split(/\d+\./).slice(1);

  if (items.length > 0) {
    return (
      <ol>
        {items.map((item, index) => {
          // Split item into segments that are inside and outside of quotations
          const segments = item.split(/("[^"]+")/).map((segment) =>
            // Check if the segment is quoted text
            segment.startsWith('"') && segment.endsWith('"') ? (
              <strong key={segment}>{segment.slice(1, -1)}</strong> // Remove quotes and wrap with <strong>
            ) : (
              segment // Non-quoted text remains unchanged
            )
          );

          if (
            segments.some((s) => {
              if (typeof s === 'string') {
                const subLines = s.split('\n').slice(1);

                if (
                  subLines.length > 0 &&
                  subLines.some((sl) => sl.includes('-') || sl.includes('•'))
                ) {
                  return true;
                } else {
                  return false;
                }
              } else {
                return false;
              }
            })
          ) {
            const item = segments[0];
            const subItems = typeof item === 'string' ? item.split('\n') : item;
            const firstItem = Array.isArray(subItems) ? subItems[0] : subItems;
            const remainingItems = Array.isArray(subItems)
              ? subItems
                  .slice(1)
                  .filter((subItem) => subItem !== '\n' && subItem.length > 0)
                  .map((subItem) => subItem.replace(/(-|•)/g, ''))
              : [];

            return (
              <li key={index} className="ml-4">
                {firstItem}
                <ul key={index} className="ml-4">
                  {remainingItems.map((segment, idx) => (
                    <li key={`${index}.${idx}-nested`}>{segment}</li>
                  ))}
                </ul>
              </li>
            );
          }

          const segment = segments[0];
          if (
            segment &&
            typeof segment === 'string' &&
            segment.includes('\n\n')
          ) {
            const segmentPieces = segment.split('\n\n');
            const lastItem = segmentPieces[0];

            return (
              <>
                <li key={index} className="ml-4">
                  {lastItem}
                </li>
                {segmentPieces.slice(1).map((segmentPiece, idx) => (
                  <p key={`${index}.${idx}-ending`} className="pt-3">
                    {segmentPiece}
                  </p>
                ))}
              </>
            );
          }

          return (
            <li key={index} className="ml-4">
              {segments}
            </li>
          );
        })}
      </ol>
    );
  } else {
    return <p>{text}</p>;
  }
}
