// Legal + support copy, held as structured data rather than markup so the web
// pages and the Expo screens render the SAME words from one definition. Editing
// prose here changes both surfaces; only the rendering differs per platform.
//
// NOTE: this file is a MIRROR of the web app's src/lib/legal.ts. The two
// bundlers have separate roots (`@/*` resolves to src/ in each), so a
// cross-import isn't possible without a shared workspace package — overkill for
// three static pages. If you edit copy here, edit it there too.

export const SUPPORT_EMAIL = 'support@flipdcampus.com';

/** Effective date shown on Terms and Privacy. */
export const LEGAL_UPDATED = 'August 3, 2026';

export type LegalSection = {
  heading: string;
  /** Paragraphs. Rendered as <p> on web, <Text> on mobile. */
  body: string[];
};

export type LegalDoc = {
  title: string;
  /** Optional lead paragraph above the first section. */
  intro?: string;
  updated?: string;
  sections: LegalSection[];
};

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: LEGAL_UPDATED,
  intro:
    'Welcome to Flipd. These Terms govern your use of the Flipd website and services. By creating an account or using Flipd, you agree to these Terms.',
  sections: [
    {
      heading: 'Who can use Flipd',
      body: [
        'Flipd is built for current USC students and requires a valid @usc.edu email address to sign in. You must be at least 18 years old, or the age of majority in your state, to use Flipd. You are responsible for keeping your sign-in access secure and for all activity under your account.',
      ],
    },
    {
      heading: 'What Flipd is',
      body: [
        'Flipd is a marketplace platform that lets verified USC students list and discover goods, food, services, popups, and housing from other verified students. Flipd does not buy, sell, prepare, ship, or deliver anything listed on the platform. We are not a party to any transaction, agreement, or meetup between users. Buyers and sellers are solely responsible for the items or services exchanged, for payment, for food safety, and for their own conduct.',
      ],
    },
    {
      heading: 'Listings',
      body: [
        'You agree that anything you list is accurately described, lawful to sell, and yours to sell. Flipd may remove any listing or account at its discretion, including for violations of these Terms, suspected fraud, safety concerns, or misuse of the verification system.',
      ],
    },
    {
      heading: 'Contact reveal and meetups',
      body: [
        'When a buyer requests contact, the seller sees the buyer’s name, school, and year and has 72 hours to approve. Once approved, both parties can see each other’s contact details and are responsible for arranging and conducting the exchange safely. Flipd strongly recommends meeting in public, well-lit campus locations and does not guarantee the identity, intentions, or reliability of any user beyond email verification against @usc.edu.',
      ],
    },
    {
      heading: 'Prohibited conduct',
      body: [
        'You may not use Flipd to sell anything illegal, unsafe, or prohibited under USC policy, harass or impersonate other users, create multiple or fraudulent accounts, or attempt to circumvent the verification or approval system.',
      ],
    },
    {
      heading: 'Disclaimers and limitation of liability',
      body: [
        'Flipd is provided “as is” without warranties of any kind. To the fullest extent permitted by law, Flipd is not liable for any loss, injury, dispute, or damages arising from transactions, meetups, or interactions between users. Flipd does not perform background checks beyond confirming a valid @usc.edu email.',
      ],
    },
    {
      heading: 'Termination',
      body: [
        'We may suspend or terminate your account at any time for violating these Terms or for conduct that harms other users or the platform.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'We may update these Terms from time to time. Continued use of Flipd after changes take effect means you accept the updated Terms.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these Terms can be sent to ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  intro: 'This Privacy Policy explains how Flipd collects, uses, and protects your information.',
  sections: [
    {
      heading: 'Information we collect',
      body: [
        'We collect your @usc.edu email address for sign-in and verification, along with your name, school, and year, which are shown to other users only after a contact reveal is approved. We collect listing content you post, such as photos, prices, and descriptions. We also collect basic usage data, like pages visited and actions taken on the platform, to keep Flipd working and to improve it.',
      ],
    },
    {
      heading: 'How we use your information',
      body: [
        'We use your information to verify you are a current USC student, operate the campus feed and listings, facilitate contact reveals between buyers and sellers, and communicate with you about your account, such as sign-in codes and approval notifications. We do not sell your personal information to third parties.',
      ],
    },
    {
      heading: 'What other users can see',
      body: [
        'Other users see your listings publicly on the feed. Your name, school, and year are only shared with a specific buyer or seller once a contact reveal has been mutually approved through the 72-hour window. Your email address itself is never shown to other users.',
      ],
    },
    {
      heading: 'Sign-in and security',
      body: [
        'Flipd uses passwordless sign-in through one-time codes sent to your @usc.edu email. We do not store passwords. We use reasonable technical and organizational measures to protect your data, but no system is completely secure, and we cannot guarantee absolute security.',
      ],
    },
    {
      heading: 'Data retention',
      body: [
        'We retain your account and listing information for as long as your account is active. If you delete your account, we will remove your personal information within a reasonable period, except where we are required to retain records for legal or safety reasons.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can update your listings or delete your account at any time. You can contact us to request a copy of your data or to ask that it be deleted.',
      ],
    },
    {
      heading: 'Third parties',
      body: [
        'We may use third-party service providers, such as email delivery or hosting services, to operate Flipd. These providers only access data as needed to perform their services and are not permitted to use it for other purposes.',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'We may update this Privacy Policy periodically. We will post the updated version here with a new effective date.',
      ],
    },
    {
      heading: 'Contact',
      body: [`For privacy questions or data requests, reach out to ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const SUPPORT: LegalDoc = {
  title: 'Support',
  sections: [
    {
      heading: 'Getting started',
      body: [
        'Sign-in requires a valid @usc.edu email. Enter your email on the homepage and we’ll send a 6-digit code. Enter the code to sign in, no password needed. If your code doesn’t arrive within a couple minutes, check spam or request a new one.',
      ],
    },
    {
      heading: 'Buying',
      body: [
        'Browse the campus feed by category: services, food, popups, housing, or goods. When you find something you want, request to reveal contact. The seller has 72 hours to approve. Once approved, you’ll see each other’s contact info and can arrange the exchange directly.',
      ],
    },
    {
      heading: 'Selling',
      body: [
        'Create a listing with a clear photo, price, and description. When a buyer requests your contact, you have 72 hours to approve or decline. Approving reveals the buyer’s name, school, and year to you, and your info to them.',
      ],
    },
    {
      heading: 'Safety tips',
      body: [
        'Meet in public, well-trafficked campus locations for exchanges. Trust the verification, but use good judgment, since Flipd verifies USC email addresses, not the details of any transaction. Report any listing or user that seems unsafe, fraudulent, or against these guidelines.',
      ],
    },
  ],
};

/**
 * Help shown in the sign-in drawer. Scoped to the three things that actually
 * strand someone mid-verification — the general SUPPORT_FAQ is about listings
 * and accounts, which nobody needs while waiting on a code.
 */
export const VERIFY_HELP: { q: string; a: string }[] = [
  {
    q: 'The code hasn’t arrived',
    a: 'Delivery usually takes under a minute. Check your spam folder, then use Resend code once the timer runs out.',
  },
  {
    q: 'It says my code is invalid or expired',
    a: 'Codes last 10 minutes and each new one replaces the last. Enter the most recent code, or resend to get a fresh one.',
  },
  {
    q: 'I used the wrong email',
    a: 'Tap Back to change the address, then request a new code.',
  },
];

/** Support FAQ — rendered as a question/answer list rather than prose. */
export const SUPPORT_FAQ: { q: string; a: string }[] = [
  {
    q: 'Why do I need a USC email?',
    a: 'Every user on Flipd is verified through @usc.edu to keep the marketplace limited to real students and reduce scams.',
  },
  {
    q: 'What happens if a seller doesn’t respond in 72 hours?',
    a: 'The contact request expires, and you’re welcome to try again or reach out to a different listing.',
  },
  {
    q: 'Can I edit or remove my listing?',
    a: 'Yes, from your account you can edit or delete any listing at any time.',
  },
  {
    q: 'How do I delete my account?',
    a: `Contact us at ${SUPPORT_EMAIL} and we’ll process your request.`,
  },
];
