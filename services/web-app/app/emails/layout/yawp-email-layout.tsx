import * as React from 'react';
import { Body, Head, Html } from '@react-email/components';
import {
  BRIAN_SIGNATURE_LINES,
  EMAIL_BANNER_BG,
  EMAIL_CARD_BG,
  EMAIL_CARD_BORDER,
  EMAIL_CARD_PAD_X,
  EMAIL_CODE_BG,
  EMAIL_DIVIDER,
  EMAIL_FOREGROUND,
  EMAIL_IDENTITY_BG,
  EMAIL_LINK,
  EMAIL_MUTED,
  EMAIL_PAGE_BG,
  EMAIL_PRIMARY,
  FONT_SANS,
  FONT_SERIF,
} from '../brand';
import { escapeHtml } from '../escape';
import { EMAIL_STYLES, PREHEADER_PAD } from './email-styles';
import { padX } from './spacing';

export type IdentityRow = {
  label: string;
  value: string;
};

export type YawpEmailLayoutProps = {
  preheader: string;
  logoBlackUrl: string;
  logoWhiteUrl: string;
  siteUrl: string;
  footerWhy: string;
  showBrianSignOff?: boolean;
  linkFallbackUrl?: string;
  banner?: React.ReactNode;
  celebrationHeadline?: string;
  headline?: string;
  children?: React.ReactNode;
};

function cellPad(top = 0, right = 0, bottom = 0, left = 0) {
  return { padding: `${top}px ${right}px ${bottom}px ${left}px` };
}

export function YawpEmailLayout({
  preheader,
  logoBlackUrl,
  logoWhiteUrl,
  siteUrl,
  footerWhy,
  showBrianSignOff,
  linkFallbackUrl,
  banner,
  celebrationHeadline,
  headline,
  children,
}: YawpEmailLayoutProps) {
  const safeSite = escapeHtml(siteUrl.replace(/\/$/, ''));
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{EMAIL_STYLES}</style>
      </Head>
      <Body
        className="yawp-page"
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: EMAIL_PAGE_BG,
        }}
      >
        <div
          style={{
            display: 'none',
            maxHeight: 0,
            overflow: 'hidden',
            opacity: 0,
            fontSize: '1px',
            lineHeight: '1px',
            color: EMAIL_PAGE_BG,
          }}
          dangerouslySetInnerHTML={{
            __html: `${escapeHtml(preheader)}${PREHEADER_PAD}`,
          }}
        />
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          bgcolor={EMAIL_PAGE_BG}
          className="yawp-page"
          style={{ backgroundColor: EMAIL_PAGE_BG, width: '100%' }}
        >
          <tbody>
            <tr>
              <td align="center" style={cellPad(24, 12, 24, 12)}>
                <table
                  role="presentation"
                  width="600"
                  cellPadding={0}
                  cellSpacing={0}
                  className="yawp-container"
                  style={{ width: '100%', maxWidth: '600px' }}
                >
                  <tbody>
                    <tr>
                      <td
                        className="yawp-card yawp-card-pad"
                        bgcolor={EMAIL_CARD_BG}
                        style={{
                          backgroundColor: EMAIL_CARD_BG,
                          border: `1px solid ${EMAIL_CARD_BORDER}`,
                          borderRadius: '12px',
                        }}
                      >
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                        >
                          <tbody>
                            <LogoHeader
                              logoBlackUrl={logoBlackUrl}
                              logoWhiteUrl={logoWhiteUrl}
                            />
                            {banner ? (
                              <tr>
                                <td className="yawp-pad-x" style={padX(0, 0)}>
                                  {banner}
                                </td>
                              </tr>
                            ) : null}
                            {celebrationHeadline ? (
                              <CelebrationBand text={celebrationHeadline} />
                            ) : null}
                            {headline ? (
                              <tr>
                                <td
                                  className="yawp-headline yawp-text yawp-pad-x"
                                  style={{
                                    ...padX(celebrationHeadline ? 20 : 24, 0),
                                    fontFamily: FONT_SERIF,
                                    fontSize: '34px',
                                    lineHeight: '40px',
                                    fontWeight: 600,
                                    color: EMAIL_FOREGROUND,
                                    textAlign: 'left',
                                  }}
                                >
                                  {headline}
                                </td>
                              </tr>
                            ) : null}
                            {children}
                            {showBrianSignOff ? (
                              <tr>
                                <td className="yawp-pad-x" style={padX(24, 0)}>
                                  <BrianSignOff />
                                </td>
                              </tr>
                            ) : null}
                            {linkFallbackUrl ? (
                              <tr>
                                <td className="yawp-pad-x" style={padX(24, 24)}>
                                  <LinkFallback url={linkFallbackUrl} />
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="yawp-footer yawp-muted"
                        align="center"
                        style={{
                          ...cellPad(20, 8, 0, 8),
                          fontFamily: FONT_SANS,
                          fontSize: '13px',
                          lineHeight: '20px',
                          color: EMAIL_MUTED,
                          textAlign: 'center',
                        }}
                      >
                        Sent by Yawp! ·{' '}
                        <a
                          href={safeSite}
                          style={{ color: EMAIL_LINK, textDecoration: 'underline' }}
                        >
                          yawp.school
                        </a>
                        <br />
                        {footerWhy}
                        <br />
                        Questions?{' '}
                        <a
                          href="mailto:support@yawp.school"
                          style={{ color: EMAIL_LINK, textDecoration: 'underline' }}
                        >
                          Write to support@yawp.school
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

function LogoHeader({
  logoBlackUrl,
  logoWhiteUrl,
}: {
  logoBlackUrl: string;
  logoWhiteUrl: string;
}) {
  const imgStyle = {
    display: 'block',
    border: 0,
    outline: 'none',
    fontFamily: 'Georgia, serif',
    fontSize: '22px',
    fontWeight: 700,
    color: EMAIL_FOREGROUND,
  } as const;
  return (
    <>
      <tr>
        <td
          align="left"
          bgcolor={EMAIL_CARD_BG}
          className="yawp-pad-x yawp-logo-cell"
          style={{
            ...padX(32, 16),
            backgroundColor: EMAIL_CARD_BG,
          }}
        >
          <img
            className="yawp-logo-light"
            src={logoBlackUrl}
            width={112}
            height={57}
            alt="Yawp!"
            style={{ ...imgStyle, width: '112px', height: '57px' }}
          />
          <img
            className="yawp-logo-dark"
            src={logoWhiteUrl}
            width={112}
            height={57}
            alt="Yawp!"
            style={{
              ...imgStyle,
              width: '112px',
              height: '57px',
              display: 'none',
              maxHeight: 0,
              overflow: 'hidden',
            }}
          />
        </td>
      </tr>
      <tr>
        <td className="yawp-pad-x" style={padX(0, 0)}>
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            className="yawp-divider"
            style={{ borderTop: `1px solid ${EMAIL_DIVIDER}` }}
          >
            <tbody>
              <tr>
                <td style={{ fontSize: '0', lineHeight: '0' }}>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </>
  );
}

export function EmailBanner({ children }: { children: React.ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      className="yawp-banner"
      style={{ ...cellPad(20, 0, 0, 0) }}
    >
      <tbody>
        <tr>
          <td
            bgcolor={EMAIL_BANNER_BG}
            className="yawp-banner yawp-text"
            style={{
              backgroundColor: EMAIL_BANNER_BG,
              borderRadius: '10px',
              padding: '15px',
              fontFamily: FONT_SANS,
              fontSize: '15px',
              lineHeight: '22px',
              color: EMAIL_FOREGROUND,
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function CelebrationBand({ text }: { text: string }) {
  return (
    <tr>
      <td
        bgcolor={EMAIL_PRIMARY}
        className="yawp-celebration yawp-pad-x"
        style={{
          backgroundColor: EMAIL_PRIMARY,
          padding: `20px ${EMAIL_CARD_PAD_X}px`,
          fontFamily: FONT_SERIF,
          fontSize: '34px',
          lineHeight: '40px',
          fontWeight: 600,
          color: '#ffffff',
        }}
      >
        {text}
      </td>
    </tr>
  );
}

export function EmailBodyBlocks({ paragraphs }: { paragraphs: React.ReactNode[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <tr key={index}>
          <td
            className="yawp-text"
            className="yawp-pad-x"
            style={{
              ...padX(index === 0 ? 20 : 20, 0),
              fontFamily: FONT_SANS,
              fontSize: '16px',
              lineHeight: '26px',
              color: EMAIL_FOREGROUND,
              textAlign: 'left',
            }}
          >
            {paragraph}
          </td>
        </tr>
      ))}
    </>
  );
}

export function EmailMutedLead({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td
        className="yawp-muted"
        className="yawp-pad-x"
        style={{
          ...padX(20, 0),
          fontFamily: FONT_SANS,
          fontSize: '15px',
          lineHeight: '22px',
          fontStyle: 'italic',
          color: EMAIL_MUTED,
          textAlign: 'left',
        }}
      >
        {children}
      </td>
    </tr>
  );
}

export function IdentityCard({ rows }: { rows: IdentityRow[] }) {
  return (
    <tr>
      <td className="yawp-pad-x" style={padX(20, 0)}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          bgcolor={EMAIL_IDENTITY_BG}
          className="yawp-identity"
          style={{
            backgroundColor: EMAIL_IDENTITY_BG,
            borderRadius: '10px',
            width: '100%',
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '14px 16px' }}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <td
                          className="yawp-id-label yawp-muted"
                          style={{
                            padding: '0 0 4px 0',
                            fontFamily: FONT_SANS,
                            fontSize: '11px',
                            lineHeight: '16px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: EMAIL_MUTED,
                            verticalAlign: 'top',
                            width: '96px',
                          }}
                        >
                          {row.label}
                        </td>
                        <td
                          className="yawp-id-value yawp-text"
                          style={{
                            padding: '0 0 12px 0',
                            fontFamily: FONT_SANS,
                            fontSize: '15px',
                            lineHeight: '22px',
                            fontWeight: 600,
                            color: EMAIL_FOREGROUND,
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function AboutYawpList({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <tr>
      <td className="yawp-pad-x" style={padX(20, 0)}>
        <div
          className="yawp-text"
          style={{
            fontFamily: FONT_SANS,
            fontSize: '15px',
            lineHeight: '22px',
            fontWeight: 700,
            color: EMAIL_FOREGROUND,
            paddingBottom: '8px',
            textAlign: 'left',
          }}
        >
          {label}
        </div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            {items.map((item) => (
              <tr key={item}>
                <td
                  valign="top"
                  width={18}
                  style={{ padding: '0 0 10px 0', verticalAlign: 'top' }}
                >
                  <table role="presentation" cellPadding={0} cellSpacing={0}>
                    <tbody>
                      <tr>
                        <td
                          width={7}
                          height={7}
                          bgcolor={EMAIL_PRIMARY}
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '999px',
                            backgroundColor: EMAIL_PRIMARY,
                            fontSize: '0',
                            lineHeight: '0',
                          }}
                        >
                          &nbsp;
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td
                  className="yawp-text"
                  style={{
                    padding: '0 0 10px 0',
                    fontFamily: FONT_SANS,
                    fontSize: '15px',
                    lineHeight: '22px',
                    color: EMAIL_FOREGROUND,
                  }}
                >
                  {item}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function CodeBlock({
  code,
  expiryLine,
}: {
  code: string;
  expiryLine: string;
}) {
  const digits = code.replace(/\s+/g, '');
  return (
    <tr>
      <td className="yawp-pad-x" style={padX(20, 0)}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          bgcolor={EMAIL_CODE_BG}
          className="yawp-code"
          style={{
            backgroundColor: EMAIL_CODE_BG,
            borderRadius: '10px',
            width: '100%',
          }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: '20px 16px' }}>
                <div
                  className="yawp-muted"
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: '11px',
                    lineHeight: '16px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: EMAIL_MUTED,
                    paddingBottom: '8px',
                  }}
                >
                  Your code
                </div>
                <div
                  className="yawp-text"
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: '44px',
                    lineHeight: '48px',
                    fontWeight: 700,
                    letterSpacing: '12px',
                    color: EMAIL_FOREGROUND,
                  }}
                >
                  {digits}
                </div>
                <div
                  className="yawp-muted"
                  style={{
                    ...cellPad(8, 0, 0, 0),
                    fontFamily: FONT_SANS,
                    fontSize: '14px',
                    lineHeight: '20px',
                    color: EMAIL_MUTED,
                  }}
                >
                  {expiryLine}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function PersonalNoteBlock({
  label,
  note,
}: {
  label: string;
  note: string;
}) {
  return (
    <tr>
      <td className="yawp-pad-x" style={padX(20, 0)}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          bgcolor={EMAIL_IDENTITY_BG}
          className="yawp-identity"
          style={{
            backgroundColor: EMAIL_IDENTITY_BG,
            borderRadius: '10px',
            width: '100%',
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '16px' }}>
                <div
                  className="yawp-muted"
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: '11px',
                    lineHeight: '16px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: EMAIL_MUTED,
                    paddingBottom: '8px',
                  }}
                >
                  {label}
                </div>
                <div
                  className="yawp-text"
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: '17px',
                    lineHeight: '26px',
                    fontStyle: 'italic',
                    color: EMAIL_FOREGROUND,
                  }}
                >
                  {note}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function PillButton({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  const safeHref = escapeHtml(href);
  return (
    <tr>
      <td align="left" className="yawp-pad-x" style={padX(24, 0)}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          className="yawp-btn-wrap"
          align="left"
        >
          <tbody>
            <tr>
              <td
                className="yawp-btn-cell"
                bgcolor={EMAIL_PRIMARY}
                style={{
                  backgroundColor: EMAIL_PRIMARY,
                  borderRadius: '999px',
                }}
              >
                {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                {/* @ts-expect-error outlook conditional */}
                <div
                  dangerouslySetInnerHTML={{
                    __html: `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="50%" stroke="f" fillcolor="${EMAIL_PRIMARY}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->`,
                  }}
                />
                <a
                  href={href}
                  className="yawp-btn-link"
                  style={{
                    display: 'inline-block',
                    backgroundColor: EMAIL_PRIMARY,
                    color: '#ffffff',
                    fontFamily: FONT_SANS,
                    fontSize: '18px',
                    fontWeight: 700,
                    lineHeight: '20px',
                    textDecoration: 'none',
                    padding: '14px 32px',
                    borderRadius: '999px',
                  }}
                >
                  {label}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function SecondaryLink({
  before,
  linkLabel,
  href,
}: {
  before: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <tr>
      <td
        align="left"
        className="yawp-pad-x yawp-text"
        style={{
          ...padX(16, 0),
          fontFamily: FONT_SANS,
          fontSize: '16px',
          lineHeight: '26px',
          color: EMAIL_FOREGROUND,
          textAlign: 'left',
        }}
      >
        {before ? `${before} ` : null}
        <a href={href} style={{ color: EMAIL_LINK, textDecoration: 'underline' }}>
          {linkLabel}
        </a>
      </td>
    </tr>
  );
}

/** 14px muted copy below CTAs (admin link expiry, etc.). */
export function FinePrint({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td
        align="left"
        className="yawp-pad-x yawp-muted"
        style={{
          ...padX(16, 0),
          fontFamily: FONT_SANS,
          fontSize: '14px',
          lineHeight: '20px',
          color: EMAIL_MUTED,
          textAlign: 'left',
        }}
      >
        {children}
      </td>
    </tr>
  );
}

function BrianSignOff() {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        {BRIAN_SIGNATURE_LINES.map((line, index) => (
          <tr key={line}>
            <td
              className="yawp-text"
              style={{
                padding: index === 1 ? '8px 0 0 0' : '0',
                fontFamily: index === 1 ? FONT_SERIF : FONT_SANS,
                fontSize: index === 1 ? '22px' : '16px',
                lineHeight: index === 1 ? '28px' : '26px',
                fontWeight: index === 1 ? 600 : 400,
                color: index === 2 ? EMAIL_MUTED : EMAIL_FOREGROUND,
              }}
            >
              {line}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinkFallback({ url }: { url: string }) {
  const safe = escapeHtml(url);
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      className="yawp-divider"
      style={{ borderTop: `1px solid ${EMAIL_DIVIDER}` }}
    >
      <tbody>
        <tr>
          <td
            className="yawp-muted"
            style={{
              ...cellPad(16, 0, 0, 0),
              fontFamily: FONT_SANS,
              fontSize: '13px',
              lineHeight: '20px',
              color: EMAIL_MUTED,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            Button not working? Paste this link into your browser:{' '}
            <a
              href={url}
              style={{ color: EMAIL_LINK, textDecoration: 'underline' }}
            >
              {safe}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
