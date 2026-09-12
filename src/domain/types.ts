export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
  builtin: boolean;
  hidden: boolean;
  version: number;
};
export type Account = {
  id: string;
  bankName: string;
  name: string;
  type: "checking" | "savings" | "credit_card" | "cash" | "other";
  archived: boolean;
  version: number;
};
export type Allocation = { expenseId: string; amount: number };
export type Transaction = {
  id: string;
  date: string;
  categoryId: string;
  subcategoryId: string | null;
  accountId: string;
  amount: number;
  reimbursable: number;
  description: string;
  comments: string;
  allocations: Allocation[];
  version: number;
  createdBy: string;
  updatedBy: string;
};
export type Transfer = {
  id: string;
  date: string;
  sourceId: string;
  destinationId: string;
  amount: number;
  description: string;
  comments: string;
  version: number;
  createdBy: string;
  updatedBy: string;
};
export type Ledger = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
};
export type Household = {
  id: string;
  currency: "CAD" | "USD";
  revision: number;
};
export type Member = {
  userId: string;
  householdId: string;
  role: "owner" | "member";
};
export type Snapshot = { household: Household; member: Member; ledger: Ledger };
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  code = "INVALID",
  status = 400,
): asserts condition {
  if (!condition) {
    throw new DomainError(code, message, status);
  }
}
