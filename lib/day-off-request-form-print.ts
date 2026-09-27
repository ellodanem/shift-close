import { printHtmlDocument } from '@/lib/print-document'

const DATE_ROW_COUNT = 4
const REASON_LINE_COUNT = 2
const COMMENT_LINE_COUNT = 5

/** Blank paper form staff fill in by hand. Matches the station's day-off request sheet. */
export function dayOffRequestFormHtml(): string {
  const dateRows = Array.from({ length: DATE_ROW_COUNT }, () => '<tr><td></td></tr>').join('')
  const reasonLines = Array.from(
    { length: REASON_LINE_COUNT },
    () => '<div class="rule"></div>'
  ).join('')
  const commentLines = Array.from(
    { length: COMMENT_LINE_COUNT },
    () => '<div class="rule"></div>'
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Day/Days off request form</title>
  <style>
    @page { size: letter; margin: 0.65in 0.75in; }
    * { box-sizing: border-box; }
    html, body { background: #fff; }
    body {
      margin: 0;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12pt;
    }
    h1 {
      margin: 0 0 36px;
      font-size: 13pt;
      font-weight: 600;
      text-align: center;
    }
    .identity { margin: 0 0 32px; }
    .identity p {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin: 0 0 18px;
    }
    .short-line {
      width: 260px;
      height: 1.15em;
      border-bottom: 1px solid #000;
    }
    table {
      width: 78%;
      margin: 8px auto 40px;
      border-collapse: collapse;
    }
    th, td { border: 1px solid #000; }
    th {
      padding: 8px 10px;
      font-size: 12pt;
      font-weight: 600;
      text-align: center;
    }
    td { height: 42px; }
    .section { margin: 0 0 26px; }
    .rule {
      height: 36px;
      border-bottom: 1px solid #000;
    }
    .sign {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin: 0 0 20px;
    }
    .sign .rule { flex: 1; height: 1.15em; }
    .approved {
      display: flex;
      align-items: center;
      gap: 22px;
      margin: 12px 0 32px;
    }
    .choice { display: inline-flex; align-items: center; gap: 12px; }
    .check {
      display: inline-block;
      width: 52px;
      height: 22px;
      border: 1px solid #000;
    }
    .approved .spacer { width: 48px; }
  </style>
</head>
<body>
  <h1>Day/Days off request form</h1>
  <div class="identity">
    <p><span class="label">Date:</span><span class="short-line"></span></p>
    <p><span class="label">Name:</span><span class="short-line"></span></p>
  </div>
  <table>
    <thead>
      <tr><th>Requested Day(s) OFF Date(s)</th></tr>
    </thead>
    <tbody>${dateRows}</tbody>
  </table>
  <div class="section">
    <div>Reason for request:</div>
    ${reasonLines}
  </div>
  <div class="sign"><span>Submitted to:</span><div class="rule"></div></div>
  <div class="sign"><span>Employee signature</span><div class="rule"></div></div>
  <div class="approved">
    <span>Approved</span>
    <span class="choice">Yes <span class="check"></span></span>
    <span class="spacer"></span>
    <span class="choice">No <span class="check"></span></span>
  </div>
  <div class="section">
    <div>Comments:</div>
    ${commentLines}
  </div>
</body>
</html>`
}

/** Opens the browser print dialog for a blank day-off request form. */
export function printDayOffRequestForm(): boolean {
  return printHtmlDocument(dayOffRequestFormHtml())
}
