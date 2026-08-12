'use client';

// The opening message, kept at the top of everything it started. Shared by the
// request rows and by the thread that request turns into, so the two views are
// recognisably the same object.
//
// Styled as a pinned message: a white card lifted off the conversation on a
// hairline and a soft shadow, with a pin. The tinted fill it replaced competed
// with the message bubbles below it for the same job — "read this one" — and
// won, which is backwards for context that is only there to orient you.
//
// Two rows: who and when on a quiet top line, then the message at full width
// below. Attribution rides next to the label rather than pushed to the far
// right, so the header reads as one phrase instead of two things at opposite
// ends of a wide card.
import { Icon } from './Icon';

export function RequestQuote({ text, label = 'THE REQUEST', by, style }: {
  text: string;
  // "YOU ASKED" when the viewer wrote it — on the outgoing tab a request
  // labelled THE REQUEST reads like somebody else's.
  label?: string;
  // Who wrote it and when, for views where the name isn't already on the row.
  by?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="req-quote" style={style}>
      <span className="req-quote-head">
        <Icon name="pin" size={12} color="var(--muted)" />
        <span className="t-eyebrow" style={{ fontSize: 10 }}>{label}</span>
        {by && <span className="req-quote-by">{by}</span>}
      </span>
      <span className="req-quote-text">{text}</span>
    </div>
  );
}
