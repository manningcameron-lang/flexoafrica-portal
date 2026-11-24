// The company-name rule lives in lib/company-match.mjs (one place, tested by
// tests/customer-name.test.mjs). This file only passes it on, so the routes
// that import "@/lib/company-match" keep working.
export { normalizeCompany, matchCustomer, registerNameFor } from "./company-match.mjs";
