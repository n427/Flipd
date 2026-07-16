# Listing Photos, Description & AI Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static photo placeholders with functional uploads (min 1 required), add a description textarea, and wire a "Generate with AI" button that calls Claude via a Next.js API route.

**Architecture:** Add `description` and `photos` state to `CreateListing` in `WebApp.tsx`. Replace placeholder tiles with a real upload grid. Add a new API route at `src/app/api/generate-description/route.ts` that calls Anthropic's SDK with title + category and returns a description string.

**Tech Stack:** React (useState, useRef), Next.js App Router API routes, `@anthropic-ai/sdk`, TypeScript

---

## File Map

- **Modify:** `src/lib/types.ts` — add `description?: string` to `Listing` and `NewListingInput`
- **Modify:** `src/components/WebApp.tsx` — add photo/description state, replace placeholder grid, add description field + AI button, disable "Preview listing" until photo uploaded
- **Create:** `src/app/api/generate-description/route.ts` — POST handler calling Claude
- **Modify:** `.env.local` (create if missing) — add `ANTHROPIC_API_KEY`

---

## Task 1: Add `description` to types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `description` field to both interfaces**

In `src/lib/types.ts`, update `Listing` and `NewListingInput`:

```typescript
export interface Listing {
  id: string;
  category: CategoryId | string;
  categoryLabel: string;
  title: string;
  price?: number;
  priceLabel: string;
  seller: Seller;
  meta: string;
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;   // ← add
  mine?: boolean;
  eventPill?: string;
  postedLabel?: string;
  contactMethod?: ContactMethod;
  isNew?: boolean;
}

export interface NewListingInput {
  category: CategoryId | string | null;
  title: string;
  price: string;
  negotiable: boolean;
  meta: string;
  contact: ContactMethod;
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;   // ← add
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit
```
Expected: no errors (or only pre-existing errors unrelated to types.ts)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add description field to Listing and NewListingInput types"
```

---

## Task 2: Install Anthropic SDK

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the SDK**

```bash
cd /Users/nicole/E-commerce && npm install @anthropic-ai/sdk
```
Expected: added `@anthropic-ai/sdk` to `package.json` dependencies

- [ ] **Step 2: Create `.env.local` with API key placeholder**

Create `/Users/nicole/E-commerce/.env.local`:
```
ANTHROPIC_API_KEY=your_key_here
```
(User must replace `your_key_here` with a real key)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install @anthropic-ai/sdk"
```
(Do NOT commit `.env.local`)

---

## Task 3: Create the API route

**Files:**
- Create: `src/app/api/generate-description/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p /Users/nicole/E-commerce/src/app/api/generate-description
```

Create `src/app/api/generate-description/route.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { title, category } = await req.json();

  if (!title || !category) {
    return NextResponse.json({ error: 'title and category required' }, { status: 400 });
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write a 2-3 sentence listing description for a USC student marketplace item. Category: ${category}. Title: ${title}. Be specific, friendly, and concise. No emojis. Return only the description text, nothing else.`,
      },
    ],
  });

  const description = (message.content[0] as { type: string; text: string }).text;
  return NextResponse.json({ description });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit
```
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate-description/route.ts
git commit -m "feat: add generate-description API route using Claude Haiku"
```

---

## Task 4: Functional photo upload grid in WebApp.tsx

**Files:**
- Modify: `src/components/WebApp.tsx` (CreateListing component, step 2)

- [ ] **Step 1: Add photo state and file input ref**

In `CreateListing`, find the existing state declarations (around line 345) and add:

```typescript
const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
const fileInputRef = React.useRef<HTMLInputElement>(null);
const [pendingSlot, setPendingSlot] = React.useState<number | null>(null);
```

- [ ] **Step 2: Add file change handler**

Directly below the state declarations, add:

```typescript
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  setPhotos((prev) => {
    const next = [...prev];
    if (pendingSlot !== null && pendingSlot < next.length) {
      URL.revokeObjectURL(next[pendingSlot].url);
      next[pendingSlot] = { file, url };
    } else {
      next.push({ file, url });
    }
    return next;
  });
  setPendingSlot(null);
  e.target.value = '';
};

const removePhoto = (index: number) => {
  setPhotos((prev) => {
    const next = [...prev];
    URL.revokeObjectURL(next[index].url);
    next.splice(index, 1);
    return next;
  });
};
```

- [ ] **Step 3: Replace the static photo grid in step 2**

Find and replace the entire photos section in step 2 (the `<label>Photos · up to 8</label>` block through its closing `</div>`):

Old:
```tsx
          <label className="field-label">Photos · up to 8</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
            <Placeholder tone={toneFor(category)} label="hero" height={84} radius={6} style={{ outline: '2px solid var(--cardinal)', outlineOffset: -1 }} />
            <Placeholder tone="cream" label="+2" height={84} radius={6} />
            <Placeholder tone="cream" label="+3" height={84} radius={6} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 84, borderRadius: 6, border: '1.5px dashed var(--rule-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-2)' }}>
                <Icon name="plus" size={18} />
              </div>
            ))}
          </div>
```

New:
```tsx
          <label className="field-label">Photos · up to 8 · at least 1 required</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative', height: 84, borderRadius: 6, overflow: 'hidden' }}>
                <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => removePhoto(i)}
                  style={{
                    position: 'absolute', top: 3, right: 3, width: 20, height: 20,
                    borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.55)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
            {photos.length < 8 && (
              <button
                onClick={() => { setPendingSlot(null); fileInputRef.current?.click(); }}
                style={{
                  height: 84, borderRadius: 6, border: '1.5px dashed var(--rule-strong)',
                  background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-2)', cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={18} />
              </button>
            )}
          </div>
```

- [ ] **Step 4: Disable "Preview listing" until photo uploaded**

Find:
```tsx
          <Button kind="primary" full size="lg" onClick={() => setStep(3)} icon="arrowRight">Preview listing</Button>
```

Replace with:
```tsx
          <Button
            kind="primary" full size="lg" icon="arrowRight"
            onClick={() => setStep(3)}
            disabled={photos.length === 0}
          >
            {photos.length === 0 ? 'Add a photo to continue' : 'Preview listing'}
          </Button>
```

- [ ] **Step 5: Verify Button component accepts `disabled` prop**

```bash
grep -n "disabled" /Users/nicole/E-commerce/src/components/ui.tsx | head -10
```

If `disabled` is not in the Button props interface, add it:
Find the Button props type in `ui.tsx` and add `disabled?: boolean;`, then pass `disabled={disabled}` to the underlying `<button>` element.

- [ ] **Step 6: Verify the app compiles and hot-reloads**

```bash
cd /Users/nicole/E-commerce && npm run dev
```
Open the app, go to Post a listing → any category → step 2. Confirm: no photo slots show a single `+` button; clicking it opens file picker; uploaded photo shows as thumbnail with × ; button label reads "Add a photo to continue" until a photo is added.

- [ ] **Step 7: Commit**

```bash
git add src/components/WebApp.tsx src/components/ui.tsx
git commit -m "feat: functional photo upload grid with 1-photo requirement"
```

---

## Task 5: Description field + Generate with AI button

**Files:**
- Modify: `src/components/WebApp.tsx`

- [ ] **Step 1: Add description and AI loading state**

In `CreateListing`, add alongside existing state:

```typescript
const [description, setDescription] = React.useState('');
const [aiLoading, setAiLoading] = React.useState(false);
```

- [ ] **Step 2: Add the generateDescription handler**

Below the `removePhoto` function:

```typescript
const generateDescription = async () => {
  if (!title.trim() || aiLoading) return;
  setAiLoading(true);
  try {
    const res = await fetch('/api/generate-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category: cats.find((c) => c.id === category)?.label || category || 'goods',
      }),
    });
    const data = await res.json();
    if (data.description) setDescription(data.description);
  } catch {
    // silently fail — user can retry
  } finally {
    setAiLoading(false);
  }
};
```

- [ ] **Step 3: Add the Description field to step 2 UI**

In step 2, find the Title field block:
```tsx
          <label className="field-label">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Sourdough loaves — Sunday pickup" style={{ marginBottom: 16 }} />
```

Replace with:
```tsx
          <label className="field-label">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Sourdough loaves — Sunday pickup" style={{ marginBottom: 16 }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="field-label" style={{ margin: 0 }}>Description</label>
            <button
              onClick={generateDescription}
              disabled={!title.trim() || aiLoading}
              style={{
                background: 'none', border: '1px solid var(--rule-strong)', borderRadius: 6,
                padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 11.5,
                color: (!title.trim() || aiLoading) ? 'var(--muted-2)' : 'var(--cardinal)',
                cursor: (!title.trim() || aiLoading) ? 'default' : 'pointer',
              }}
            >
              <Icon name="sparkle" size={12} />
              {aiLoading ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field"
            placeholder="Describe your item — condition, size, why you're selling it…"
            rows={3}
            style={{ marginBottom: 16, resize: 'vertical' }}
          />
```

- [ ] **Step 4: Pass description through publish**

Find the `publish` function (around line 363):
```typescript
  const publish = () =>
    onPublish({
      category, title: title || 'Untitled listing', price, negotiable: neg,
      meta: location, contact, photoTone: toneFor(category), photoLabel: 'your photo',
    });
```

Replace with:
```typescript
  const publish = () =>
    onPublish({
      category, title: title || 'Untitled listing', price, negotiable: neg,
      meta: location, contact, photoTone: toneFor(category), photoLabel: 'your photo',
      description,
    });
```

- [ ] **Step 5: Verify the app works end-to-end**

```bash
cd /Users/nicole/E-commerce && npm run dev
```
Test:
1. Go to Post a listing → pick a category → step 2
2. Enter a title, observe "Generate with AI" becomes active (cardinal colored)
3. Click "Generate with AI" — button shows "Generating…", then textarea fills with a description
4. Clear title — button grays out
5. Upload a photo — "Preview listing" button becomes active

- [ ] **Step 6: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat: description field with AI generation using title + category"
```
