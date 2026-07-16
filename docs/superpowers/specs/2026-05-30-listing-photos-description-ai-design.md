# Listing Form: Photos, Description & AI Generation

## Summary

Improve step 2 of the "Post a listing" flow with functional photo uploads (min 1 required), a description field, and an AI-powered description generator using title + category as input.

## Photos

- Remove the static placeholder tiles (hero, +2, +3 Placeholder components)
- Replace with a grid of up to 8 upload slots, each rendered as a `+` add-button (dashed border, same 84px height)
- Clicking a slot opens a native `<input type="file" accept="image/*">`
- Uploaded images render as thumbnails (object-fit: cover) with an × remove button in the top-right corner
- First slot is required — "Preview listing" button is disabled and visually muted until at least 1 photo is uploaded
- Photos stored in component state as `File` objects + local object URLs for preview; no server upload needed (prototype scope)

## Description Field

- `<textarea>` added below the Title field, ~3 rows
- Label: "Description"
- Placeholder: "Describe your item — condition, size, why you're selling it…"
- State: `description` string, passed through to the listing preview

## Generate with AI Button

- Small inline button placed to the right of the "Description" label
- Label: "Generate with AI" with a sparkle icon; shows a spinner + "Generating…" while loading
- On click: POST to `/api/generate-description` with `{ title, category }`
- API route calls Claude (`claude-haiku-4-5-20251001`) with a short prompt and returns a 2–3 sentence description
- Response populates the textarea (overwrites existing content)
- Button disabled while loading or if title is empty
- Error state: shows "Try again" if the API call fails

## API Route

- Path: `src/app/api/generate-description/route.ts`
- Method: POST, body: `{ title: string, category: string }`
- Uses `@anthropic-ai/sdk`, reads `ANTHROPIC_API_KEY` from env
- Prompt: `"Write a 2-3 sentence listing description for a USC student marketplace item. Category: {category}. Title: {title}. Be specific, friendly, and concise. No emojis."`
- Returns `{ description: string }`
- Install dependency: `npm install @anthropic-ai/sdk`

## Validation

- "Preview listing" disabled until `photos.length >= 1`
- "Generate with AI" disabled when `title.trim() === ''`
