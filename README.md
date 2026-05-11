# Flexo Africa Customer Portal
Last redeploy: 2026-05-11 (Stage G — new dashboard, job detail, profile)

Customer-facing site for portal.flexoafrica.com. Sibling app to the MIS at jobs.flexoafrica.com.

Same Firebase project (`flexo-africa-jobs`), separate Vercel deployment.

## Run locally

```bash
cd portal
npm install
npm run dev
```

Opens on http://localhost:3001 (port 3001 to avoid clash with MIS on 3000).

## Spec

Full spec lives in `../PORTAL.md` (parent folder).

## Env

`.env.local` is already filled with the shared Firebase config. Add your WhatsApp business number to `NEXT_PUBLIC_WHATSAPP_NUMBER` to wire up the click-to-chat button in the footer.

## Build stages

1. Stage 1: foundation (Home, Login, Signup, Dashboard skeleton, customer Auth role) - in progress
2. Stage 2: public configurator + Services + About + Contact
3. Stage 3: Place Order, Job Detail with comments and approvals, Order History, Reorder
4. Stage 4: payments (Stripe or Peach), invoices, account billing
5. Stage 5: marketing polish, SEO, email templates, mobile QA
6. Stage 6: MIS additions (portal jobs view, customer accounts management)
