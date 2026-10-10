/**
 * peer-rent — the J6 rent/borrow vs buy module (W2-012).
 *
 * J6: compare renting or borrowing against buying, with duration,
 * availability, deposit, condition, return, damage and recourse terms
 * visible. The rental lifecycle advances through the REAL deterministic
 * commerce runtime (rentalTransition / depositReturn — public
 * @unicom/commerce entrypoint), rendered as read-side state; the UI hands
 * off nothing canonical (demo mode never opens a real rental).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "peer-rent",
  title: "Rent or borrow",
  description:
    "J6 — rent/borrow vs buy with duration, availability, deposit, condition, return, damage and recourse terms; the rental lifecycle runs on the deterministic commerce runtime and OVERDUE stays a preserved state, never a failure.",
  owner: "W2-012",
  journeys: ["J6"],
  roles: ["buyer", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/rent",
      label: "Rent or borrow",
      description: "Rent instead of buying — deposits, condition and return terms up front.",
      journeys: ["J6"],
    },
  ],
  load: () => import("./component.js"),
});
