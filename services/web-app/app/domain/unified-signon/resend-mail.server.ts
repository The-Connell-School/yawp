import { FlowError } from './flow.server';
export function assertResendMailAvailable() {
  if (process.env.NODE_ENV !== 'production' && !process.env.SIGNON_MAIL_CAPTURE_DIR)
    throw new FlowError('Email delivery is unavailable.', 503);
}
