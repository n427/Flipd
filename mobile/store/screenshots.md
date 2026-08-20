# App Store Screenshot Storyboard

Use real UI from the final TestFlight build. Do not fabricate authenticated content or show features that are absent from the submitted binary. Screenshots must not contain alpha/transparency.

Apple currently accepts one to ten screenshots. For the 6.9-inch iPhone slot, use one consistent portrait size from:

- 1260 × 2736
- 1290 × 2796
- 1320 × 2868

## Five-shot sequence

1. **The USC marketplace**
   - Screen: Feed with credible, policy-compliant seeded listings.
   - Caption: “The USC marketplace”
   - Subcopy: “Discover what verified students are selling and creating.”

2. **Know who you’re buying from**
   - Screen: Listing detail with seller identity, campus context, and safety affordances visible.
   - Caption: “Verified student access”
   - Subcopy: “Every account signs in with an @usc.edu email.”

3. **Connect on your terms**
   - Screen: Request flow or Requests inbox with no private information exposed.
   - Caption: “Safer contact requests”
   - Subcopy: “Sellers choose which conversations to open.”

4. **Post in minutes**
   - Screen: Polished listing composer with real licensed/owned product media.
   - Caption: “Post from your phone”
   - Subcopy: “Add photos, details, price, and pickup location.”

5. **Keep the conversation in Flipd**
   - Screen: Message thread with the report control visible and non-sensitive seeded copy.
   - Caption: “Built-in messaging”
   - Subcopy: “Chat, share media, report concerns, and block when needed.”

## Capture rules

- Use a dedicated screenshot account and policy-compliant seed data.
- Remove real names, email addresses, phone numbers, notification tokens, verification codes, and private conversations.
- Use consistent status-bar time, device language, theme, and network state.
- Verify every caption remains readable at App Store thumbnail size.
- Do not imply USC endorsement or use USC trademarks beyond truthful textual description of eligibility.
- Optional App Preview video is deferred until the five screenshots and TestFlight flow are approved.

## iPad decision

Expo’s current configuration does not explicitly enable tablet support. Before the production build, inspect the generated iOS target:

- If iPad support is disabled, document that decision and submit only required iPhone screenshots.
- If iPad support is enabled, perform the complete iPad layout pass and capture every required iPad screenshot size before submission.

