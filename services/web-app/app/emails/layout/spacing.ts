import { EMAIL_CARD_PAD_X } from '../brand';

export function padX(top = 0, bottom = 0) {
  return {
    padding: `${top}px ${EMAIL_CARD_PAD_X}px ${bottom}px ${EMAIL_CARD_PAD_X}px`,
  };
}
