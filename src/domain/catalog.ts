import type { Category, Ledger } from "./types";
export const catalog: Record<string, string[]> = {
  Income: ["Salary", "Bonus", "Interest", "Gifts received", "Refund", "Other"],
  Housing: ["Rent/mortgage", "Utilities", "Maintenance"],
  Food: ["Groceries", "Dining out", "Drinks & Snacks", "Alcohol"],
  Transport: ["Public transit", "Fuel", "Parking", "Maintenance"],
  Health: ["Medical", "Dental", "Pharmacy", "Fitness & Gym"],
  "Personal Care": ["Haircuts & Grooming", "Toiletries"],
  Insurance: ["Health", "Home", "Vehicle", "Other"],
  Shopping: ["Clothing", "Electronics", "Household items"],
  Leisure: ["Entertainment", "Subscriptions", "Hobbies"],
  Travel: ["Transport", "Lodging", "Activities"],
  Family: ["Childcare", "Education", "Pets"],
  Giving: ["Gifts", "Donations"],
  Other: ["Fees", "Miscellaneous"],
};
export function starterCategories(): Category[] {
  return Object.entries(catalog).flatMap(([name, children]) => {
    const id = crypto.randomUUID(),
      kind = name === "Income" ? ("income" as const) : ("expense" as const);
    return [
      {
        id,
        name,
        kind,
        parentId: null,
        builtin: true,
        hidden: false,
        version: 1,
      },
      ...children.map((name) => ({
        id: crypto.randomUUID(),
        name,
        kind,
        parentId: id,
        builtin: true,
        hidden: false,
        version: 1,
      })),
    ];
  });
}
export function emptyLedger(): Ledger {
  return {
    accounts: [],
    categories: starterCategories(),
    transactions: [],
    transfers: [],
  };
}
