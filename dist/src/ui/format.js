export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=paise=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:paise%100?2:0}).format(paise/100);
export function compactMoney(paise){const n=paise/100;return n>=100000?`₹${(n/100000).toFixed(2)}L`:money(paise);}
export const number=n=>new Intl.NumberFormat('en-IN').format(n);
export const date=iso=>iso?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z')):'Not covered';
export function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function orderCSV(result){const header=['Order ID','Customer','Part','Due date','Required by','Expected completion','Quantity','Units short by required date','Status','Full order value INR','Exposed order value INR'];return '\ufeff'+[header,...result.rows.map(o=>[o.id,o.customer,o.partName,o.due,o.requiredBy,o.expectedDate??'',o.quantity,o.shortfall,o.atRisk?'At risk':'Covered',(o.orderValuePaise/100).toFixed(2),(o.exposurePaise/100).toFixed(2)])].map(row=>row.map(csvCell).join(',')).join('\r\n');}
