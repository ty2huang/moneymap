import type { Ledger, Transaction, Transfer } from './types';
import { csv, type Report } from './analytics';
import { decimal, netCost } from './money';

export function transactionCsv(ledger:Ledger, records:(Transaction|Transfer)[], currency:string) {
  return csv([
    ['ID','Date','Kind','Category','Subcategory','Account','Destination account','Currency','Amount','Reimbursable','Net cost','Description','Comments','Reimbursement allocations'],
    ...records.map(t=>{
      const transfer='sourceId' in t;
      const category=!transfer?ledger.categories.find(c=>c.id===t.categoryId):undefined;
      return [t.id,t.date,transfer?'transfer':category!.kind,category?.name??'',!transfer?ledger.categories.find(c=>c.id===t.subcategoryId)?.name??'':'',ledger.accounts.find(a=>a.id===(transfer?t.sourceId:t.accountId))?.name??'',transfer?ledger.accounts.find(a=>a.id===t.destinationId)?.name??'':'',currency,decimal(t.amount,currency),transfer?'':decimal(t.reimbursable,currency),transfer?'':decimal(netCost(t.amount,t.reimbursable,category!.kind),currency),t.description,t.comments,transfer?'':JSON.stringify(t.allocations.map(a=>({...a,amount:decimal(a.amount,currency)})))];
    })
  ]);
}

export function reportCsv(report:Report,currency:string) {
  return csv([['Period','Category','Currency','Income','Outflows','Spending'],...report.periods.flatMap(period=>{
    const rows=report.rows.filter(r=>r.period===period);
    return rows.length?rows.map(r=>[r.period,r.label,currency,decimal(r.income,currency),decimal(r.outflows,currency),decimal(r.spending,currency)]):[[period,'No activity',currency,decimal(0,currency),decimal(0,currency),decimal(0,currency)]];
  })]);
}
