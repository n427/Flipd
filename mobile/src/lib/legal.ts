// Legal + support copy, held as structured data rather than markup so the web
// pages and the Expo screens render the SAME words from one definition. Editing
// prose here changes both surfaces; only the rendering differs per platform.
//
// NOTE: this file is a MIRROR of the web app's src/lib/legal.ts. The two
// bundlers have separate roots (`@/*` resolves to src/ in each), so a
// cross-import isn't possible without a shared workspace package. If you edit
// copy here, edit it there too.
//
// VERIFY_HELP at the bottom is MOBILE ONLY and has no web counterpart. Do not
// replace this file by copying the web one wholesale, or it will be lost.

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
        'Flipd is built for USC students and alumni and requires a valid @usc.edu or @alumni.usc.edu email address to sign in. You must be at least 18 years old, or the age of majority in your state, to use Flipd. You are responsible for keeping your sign-in access secure and for all activity under your account.',
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
      heading: 'Requests, messages, and meetups',
      body: [
        'To reach a seller, a buyer sends a request with a short message. The seller sees the buyer’s name, school, year, and that message, and has 72 hours to approve or decline. If they approve, a conversation opens inside Flipd where the two of you can arrange the exchange.',
        'Flipd does not share phone numbers, email addresses, or social handles between users. Requests may not be used to pass along contact details, and we may block messages that appear to do so before a seller has approved.',
        'You are responsible for arranging and conducting any exchange safely. Flipd strongly recommends meeting in public, well-lit campus locations, and does not guarantee the identity, intentions, or reliability of any user beyond email verification against @usc.edu.',
      ],
    },
    {
      heading: 'Messages and attachments',
      body: [
        'Messages, photos, and videos you send through Flipd are stored so the conversation stays available to both people in it. Do not send anything unlawful, harassing, sexually explicit, or that you do not have the right to share. We may remove message content and suspend accounts that violate these Terms.',
        'Attachments are private to the conversation they were sent in and are not published to the marketplace. They are served through links that expire, though you should assume anything you send can be saved by the person who receives it.',
      ],
    },
    {
      heading: 'Prohibited conduct',
      body: [
        'You may not use Flipd to sell anything illegal, unsafe, or prohibited under USC policy, harass or impersonate other users, create multiple or fraudulent accounts, send unsolicited advertising through messages, or attempt to circumvent the verification, approval, or messaging systems.',
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
        'We collect your @usc.edu email address for sign-in and verification, along with your name, school, and year. We collect listing content you post, such as photos, prices, and descriptions.',
        'We collect the messages you send through Flipd, including any photos or videos you attach, so conversations stay available to both people in them. We also collect the notification settings you choose, so we know where and whether to contact you.',
        'We collect basic usage data, like pages visited and actions taken on the platform, to keep Flipd working and to improve it.',
      ],
    },
    {
      heading: 'How we use your information',
      body: [
        'We use your information to verify you are a current USC student, operate the campus feed and listings, deliver messages between buyers and sellers, and communicate with you about your account, such as sign-in codes, request approvals, and new messages. Your email address is used only to reach you, never to identify you to another user. We do not sell your personal information to third parties.',
      ],
    },
    {
      heading: 'What other users can see',
      body: [
        'Other users see your listings publicly on the feed, along with your name, school, year, profile photo, rating, and how many exchanges you have completed on Flipd.',
        'When you send a request, the seller sees your name, school, year, and the message you wrote. Your email address is never shown to another user. Messages and attachments are visible only to the two people in a conversation.',
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
        'You can update your listings, change your notification settings, or delete your account at any time. You can contact us to request a copy of your data or to ask that it be deleted.',
      ],
    },
    {
      heading: 'Third parties',
      body: [
        'We may use third-party service providers, such as email delivery, push notification, file storage, and hosting services, to operate Flipd. These providers only access data as needed to perform their services and are not permitted to use it for other purposes.',
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
        'Sign-in requires a valid @usc.edu or @alumni.usc.edu email. Enter your email on the homepage and we’ll send a 6-digit code. Enter the code to sign in, no password needed. If your code doesn’t arrive within a couple minutes, check spam or request a new one.',
      ],
    },
    {
      heading: 'Buying',
      body: [
        'Browse the campus feed by category: services, food, popups, housing, or goods. When you find something you want, send the seller a request with a short message saying what you are after. The seller has 72 hours to approve. Once they do, a conversation opens in Flipd where you can sort out the details.',
      ],
    },
    {
      heading: 'Selling',
      body: [
        'Create a listing with a clear photo, price, and description. When a buyer sends a request, you see their name, school, year, how many exchanges they have completed, and their message. You have 72 hours to approve or decline. Approving opens a conversation with them, and declining lets you add an optional reason.',
      ],
    },
    {
      heading: 'Safety tips',
      body: [
        'Meet in public, well-trafficked campus locations for exchanges. Trust the verification, but use good judgment, since Flipd verifies USC email addresses, not the details of any transaction.',
        'Keep conversations in Flipd until you are comfortable. Requests cannot include phone numbers or social handles, which keeps a seller from being contacted off-platform before they have agreed to it. Report any listing, message, or user that seems unsafe, fraudulent, or against these guidelines.',
      ],
    },
  ],
};

/** Support FAQ — rendered as a question/answer list rather than prose. */
export const SUPPORT_FAQ: { q: string; a: string }[] = [
  {
    q: 'Why do I need a USC email?',
    a: 'Every user verifies with an official @usc.edu or @alumni.usc.edu address to keep Flipd within the Trojan community.',
  },
  {
    q: 'What happens if a seller doesn’t respond in 72 hours?',
    a: 'The request expires, and you’re welcome to try again or reach out to a different listing.',
  },
  {
    q: 'Why can’t I put my number in a request?',
    a: 'Messaging stays in Flipd so a seller decides who reaches them, and so there is a record if something goes wrong. Once a seller approves, your conversation opens in the app and you can share whatever you want from there.',
  },
  {
    q: 'Can I send photos or videos?',
    a: 'Yes. Once a conversation is open you can attach photos and short videos, which is useful for showing condition, sizing, or exactly where to meet.',
  },
  {
    q: 'Can I edit or remove my listing?',
    a: 'Yes, from your account you can edit or delete any listing at any time.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Open Profile, choose Delete account, review what will be removed, and enter the confirmation phrase. Flipd may retain anonymized safety or transaction records where required.',
  },
];

export const COMMUNITY_GUIDELINES: LegalDoc = {
  title: 'Community Guidelines',
  updated: LEGAL_UPDATED,
  intro:
    'Flipd is a student marketplace built around verified identity, respectful communication, and safer campus exchanges. These rules apply to listings, profiles, requests, messages, reviews, and in-person conduct connected to Flipd.',
  sections: [
    {
      heading: 'Be honest and respectful',
      body: [
        'Describe items and services accurately, use your real identity, honor agreed prices and meetup details, and communicate respectfully. Do not harass, threaten, discriminate against, sexually exploit, impersonate, shame, or pressure another person.',
      ],
    },
    {
      heading: 'What cannot be listed',
      body: [
        'Do not list illegal, stolen, counterfeit, recalled, age-restricted, or unsafe goods. Weapons, drugs, alcohol, tobacco or nicotine products, controlled substances, forged documents, account credentials, and products prohibited by USC policy are not allowed.',
        'Food must be described honestly, including relevant ingredients or known allergens. Housing listings must be genuine and authorized. Academic cheating, completed assignments for sale, exam materials obtained improperly, and unlicensed regulated services are not allowed.',
      ],
    },
    {
      heading: 'Keep transactions safe',
      body: [
        'Meet in public, well-lit, well-trafficked campus locations when possible. Inspect an item before paying, do not send deposits to unverified third parties, and stop an exchange if details change unexpectedly or you feel unsafe.',
        'Keep early communication inside Flipd. Never pressure someone to share private contact, financial, identity, or location information.',
      ],
    },
    {
      heading: 'Reporting and blocking',
      body: [
        'Use Report on a listing, profile, or conversation when something appears fraudulent, unsafe, abusive, or against these Guidelines. Use Block to prevent further contact and hide each other’s marketplace activity. For immediate danger, contact campus public safety or emergency services before contacting Flipd.',
      ],
    },
    {
      heading: 'Enforcement',
      body: [
        'Flipd may remove content, limit features, suspend accounts, preserve relevant records, or permanently remove users when we identify violations or credible safety concerns. Serious or repeated violations may be escalated to USC or law enforcement when legally required or necessary to protect someone from harm.',
      ],
    },
    {
      heading: 'Contact',
      body: [
        `Questions or urgent safety reports can be sent to ${SUPPORT_EMAIL}. Include the listing, profile, or conversation involved and enough detail for us to investigate, but do not email passwords, verification codes, or sensitive financial information.`,
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
