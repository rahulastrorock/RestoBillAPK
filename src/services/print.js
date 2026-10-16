/**
 * Print Service - Generates HTML for thermal receipts and A4 tax invoices
 */
class PrintService {
  init() {
    // No DB needed for print service
  }

  /**
   * Generate HTML for thermal receipt (58mm/80mm)
   */
  generateReceiptHtml(order, settings) {
    const {
      restaurant_name = 'Restaurant',
      restaurant_address = '',
      restaurant_phone = '',
      gstin = '',
      fssai_no = '',
      footer_text = 'Thank you! Visit again!',
      printer_width = '80',
      currency_symbol = '₹',
    } = settings;

    const width = printer_width === '58' ? '48mm' : '72mm';
    const fontSize = printer_width === '58' ? '10px' : '12px';

    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatCurrency = (amount) => {
      return `${currency_symbol}${parseFloat(amount).toFixed(2)}`;
    };

    let itemsHtml = '';
    for (const item of (order.items || [])) {
      const qty = parseFloat(item.quantity);
      const total = parseFloat(item.total);
      itemsHtml += `
        <tr>
          <td style="text-align:left; padding:2px 0;">${item.name}</td>
          <td style="text-align:center; padding:2px 0;">${qty}</td>
          <td style="text-align:right; padding:2px 0;">${formatCurrency(item.price)}</td>
          <td style="text-align:right; padding:2px 0;">${formatCurrency(total)}</td>
        </tr>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: ${fontSize};
      width: ${width};
      padding: 4px;
      color: #000;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    .double-divider {
      border-top: 2px double #000;
      margin: 4px 0;
    }
    .restaurant-name {
      font-size: ${printer_width === '58' ? '14px' : '16px'};
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    .total-row td {
      font-weight: bold;
      font-size: ${printer_width === '58' ? '12px' : '14px'};
      padding-top: 4px;
    }
    .info-row { margin: 2px 0; }
    .info-row span { display: inline-block; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center">
    <div class="restaurant-name">${restaurant_name}</div>
    ${restaurant_address ? `<div>${restaurant_address}</div>` : ''}
    ${restaurant_phone ? `<div>Ph: ${restaurant_phone}</div>` : ''}
    ${gstin ? `<div>GSTIN: ${gstin}</div>` : ''}
    ${fssai_no ? `<div>FSSAI: ${fssai_no}</div>` : ''}
  </div>

  <div class="double-divider"></div>

  <!-- Invoice Info -->
  <div class="center bold">TAX INVOICE</div>
  <div class="divider"></div>

  <div class="info-row">
    <span>Bill No: ${order.order_no}</span>
  </div>
  <div class="info-row">
    <span>Date: ${formatDate(order.created_at)}</span>
  </div>
  ${order.table_no ? `<div class="info-row"><span>Table: ${order.table_no}</span></div>` : ''}
  ${order.order_type ? `<div class="info-row"><span>Type: ${order.order_type.replace('_', ' ').toUpperCase()}</span></div>` : ''}
  ${order.user_name ? `<div class="info-row"><span>Cashier: ${order.user_name}</span></div>` : ''}
  ${order.customer_name ? `<div class="info-row"><span>Customer: ${order.customer_name}</span></div>` : ''}
  ${order.customer_gstin ? `<div class="info-row"><span>GSTIN: ${order.customer_gstin}</span></div>` : ''}

  <div class="divider"></div>

  <!-- Items -->
  <table>
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align:left; padding:2px 0;">Item</th>
        <th style="text-align:center; padding:2px 0;">Qty</th>
        <th style="text-align:right; padding:2px 0;">Rate</th>
        <th style="text-align:right; padding:2px 0;">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Totals -->
  <table>
    <tr>
      <td>Subtotal</td>
      <td class="right">${formatCurrency(order.subtotal)}</td>
    </tr>
    ${parseFloat(order.discount_amount) > 0 ? `
    <tr>
      <td>Discount ${order.discount_type === 'percent' ? `(${order.discount_value}%)` : ''}</td>
      <td class="right">-${formatCurrency(order.discount_amount)}</td>
    </tr>` : ''}
    <tr>
      <td>CGST</td>
      <td class="right">${formatCurrency(order.cgst)}</td>
    </tr>
    <tr>
      <td>SGST</td>
      <td class="right">${formatCurrency(order.sgst)}</td>
    </tr>
    ${parseFloat(order.round_off) !== 0 ? `
    <tr>
      <td>Round Off</td>
      <td class="right">${parseFloat(order.round_off) > 0 ? '+' : ''}${formatCurrency(order.round_off)}</td>
    </tr>` : ''}
  </table>

  <div class="double-divider"></div>

  <table>
    <tr class="total-row">
      <td>GRAND TOTAL</td>
      <td class="right">${formatCurrency(order.total)}</td>
    </tr>
  </table>

  <div class="double-divider"></div>

  <!-- Payment -->
  <div class="info-row">
    <span>Payment: ${(order.payment_mode || 'cash').toUpperCase()}</span>
  </div>
  ${order.payment_details ? `<div class="info-row"><span>${order.payment_details}</span></div>` : ''}

  <div class="divider"></div>

  <!-- GST Summary -->
  <div class="center bold" style="margin:4px 0;">GST Summary</div>
  <table style="font-size: ${printer_width === '58' ? '9px' : '10px'};">
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align:left;">Rate</th>
        <th style="text-align:right;">Taxable</th>
        <th style="text-align:right;">CGST</th>
        <th style="text-align:right;">SGST</th>
      </tr>
    </thead>
    <tbody>
      ${this._getGstSummaryRows(order.items, currency_symbol)}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Footer -->
  <div class="center" style="margin-top:8px;">
    <div>${footer_text}</div>
    ${order.notes ? `<div style="margin-top:4px; font-style:italic;">${order.notes}</div>` : ''}
  </div>

  <div style="margin-top: 16px;"></div>
</body>
</html>`;
  }

  /**
   * Generate HTML for A4 Tax Invoice
   */
  generateInvoiceHtml(order, settings) {
    const {
      restaurant_name = 'Restaurant',
      restaurant_address = '',
      restaurant_phone = '',
      restaurant_email = '',
      gstin = '',
      fssai_no = '',
      state_name = '',
      state_code = '',
      currency_symbol = '₹',
    } = settings;

    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount) => {
      return `${currency_symbol}${parseFloat(amount).toFixed(2)}`;
    };

    let itemsHtml = '';
    let sno = 1;
    for (const item of (order.items || [])) {
      itemsHtml += `
        <tr>
          <td>${sno++}</td>
          <td>${item.name}</td>
          <td class="center">${item.gst_rate}%</td>
          <td class="right">${parseFloat(item.quantity)}</td>
          <td class="right">${formatCurrency(item.price)}</td>
          <td class="right">${formatCurrency(item.taxable_amount)}</td>
          <td class="right">${formatCurrency(item.cgst)}</td>
          <td class="right">${formatCurrency(item.sgst)}</td>
          <td class="right">${formatCurrency(item.total)}</td>
        </tr>`;
    }

    const totalInWords = this._numberToWords(Math.round(parseFloat(order.total)));

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #333;
      padding: 20px;
    }
    .invoice-box {
      max-width: 210mm;
      margin: auto;
      border: 2px solid #333;
      padding: 20px;
    }
    .header { display: flex; justify-content: space-between; margin-bottom: 15px; }
    .header-left { flex: 1; }
    .header-right { text-align: right; }
    .restaurant-name { font-size: 22px; font-weight: bold; color: #1a1a1a; margin-bottom: 5px; }
    .invoice-title { 
      text-align: center; font-size: 16px; font-weight: bold; 
      padding: 8px; background: #f0f0f0; margin: 10px 0; border: 1px solid #ccc;
    }
    .info-grid { display: flex; justify-content: space-between; margin: 10px 0; }
    .info-section { flex: 1; }
    .info-section h4 { margin-bottom: 5px; color: #555; font-size: 11px; text-transform: uppercase; }
    .info-section p { margin: 2px 0; }
    table.items { width: 100%; border-collapse: collapse; margin: 10px 0; }
    table.items th {
      background: #f8f8f8; padding: 8px 6px; border: 1px solid #ccc;
      font-size: 11px; text-transform: uppercase; color: #555;
    }
    table.items td { padding: 6px; border: 1px solid #ddd; }
    .center { text-align: center; }
    .right { text-align: right; }
    .totals-section { display: flex; justify-content: space-between; margin-top: 10px; }
    .amount-words { flex: 1; padding-right: 20px; font-style: italic; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 4px 8px; }
    .totals-table .grand-total td { 
      font-weight: bold; font-size: 14px; 
      border-top: 2px solid #333; padding-top: 8px;
    }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; }
    .footer-left { font-size: 11px; color: #666; }
    .signature { text-align: right; }
    .signature-line { border-top: 1px solid #333; width: 200px; margin-top: 40px; padding-top: 5px; }
    @media print {
      body { padding: 0; }
      .invoice-box { border: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="restaurant-name">${restaurant_name}</div>
        <p>${restaurant_address}</p>
        ${restaurant_phone ? `<p>Phone: ${restaurant_phone}</p>` : ''}
        ${restaurant_email ? `<p>Email: ${restaurant_email}</p>` : ''}
        ${gstin ? `<p><strong>GSTIN:</strong> ${gstin}</p>` : ''}
        ${fssai_no ? `<p><strong>FSSAI:</strong> ${fssai_no}</p>` : ''}
        ${state_name ? `<p><strong>State:</strong> ${state_name} (${state_code})</p>` : ''}
      </div>
      <div class="header-right">
        <div style="font-size:11px; color:#666;">Original/Duplicate</div>
      </div>
    </div>

    <div class="invoice-title">TAX INVOICE</div>

    <!-- Invoice & Customer Info -->
    <div class="info-grid">
      <div class="info-section">
        <h4>Invoice Details</h4>
        <p><strong>Invoice No:</strong> ${order.order_no}</p>
        <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
        ${order.table_no ? `<p><strong>Table:</strong> ${order.table_no}</p>` : ''}
        <p><strong>Type:</strong> ${(order.order_type || 'dine_in').replace('_', ' ').toUpperCase()}</p>
        <p><strong>Cashier:</strong> ${order.user_name || '-'}</p>
      </div>
      <div class="info-section" style="text-align:right;">
        <h4>Customer Details</h4>
        <p>${order.customer_name || 'Walk-in Customer'}</p>
        ${order.customer_phone ? `<p>Phone: ${order.customer_phone}</p>` : ''}
        ${order.customer_gstin ? `<p><strong>GSTIN:</strong> ${order.customer_gstin}</p>` : ''}
      </div>
    </div>

    <!-- Items Table -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Item Description</th>
          <th style="width:50px;">GST%</th>
          <th style="width:40px;">Qty</th>
          <th style="width:70px;">Rate</th>
          <th style="width:80px;">Taxable Amt</th>
          <th style="width:60px;">CGST</th>
          <th style="width:60px;">SGST</th>
          <th style="width:80px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
      <div class="amount-words">
        <strong>Amount in words:</strong><br>
        Rupees ${totalInWords} Only
      </div>
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td class="right">${formatCurrency(order.subtotal)}</td>
        </tr>
        ${parseFloat(order.discount_amount) > 0 ? `
        <tr>
          <td>Discount ${order.discount_type === 'percent' ? `(${order.discount_value}%)` : ''}:</td>
          <td class="right">-${formatCurrency(order.discount_amount)}</td>
        </tr>` : ''}
        <tr>
          <td>Taxable Amount:</td>
          <td class="right">${formatCurrency(order.taxable_amount)}</td>
        </tr>
        <tr>
          <td>CGST:</td>
          <td class="right">${formatCurrency(order.cgst)}</td>
        </tr>
        <tr>
          <td>SGST:</td>
          <td class="right">${formatCurrency(order.sgst)}</td>
        </tr>
        ${parseFloat(order.round_off) !== 0 ? `
        <tr>
          <td>Round Off:</td>
          <td class="right">${parseFloat(order.round_off) > 0 ? '+' : ''}${formatCurrency(order.round_off)}</td>
        </tr>` : ''}
        <tr class="grand-total">
          <td>Grand Total:</td>
          <td class="right">${formatCurrency(order.total)}</td>
        </tr>
      </table>
    </div>

    <!-- Payment & Footer -->
    <div style="margin-top:10px; padding:8px; background:#f9f9f9; border:1px solid #eee;">
      <strong>Payment Mode:</strong> ${(order.payment_mode || 'cash').toUpperCase()}
      ${order.payment_details ? ` | ${order.payment_details}` : ''}
    </div>

    <div class="footer">
      <div class="footer-left">
        <p>This is a computer-generated invoice.</p>
        ${gstin ? '<p>Subject to jurisdiction of local courts.</p>' : ''}
      </div>
      <div class="signature">
        <div class="signature-line">Authorized Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Helper: Get GST summary rows grouped by rate
   */
  _getGstSummaryRows(items, symbol = '₹') {
    const gstMap = {};
    for (const item of (items || [])) {
      const rate = parseFloat(item.gst_rate);
      if (!gstMap[rate]) {
        gstMap[rate] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      gstMap[rate].taxable += parseFloat(item.taxable_amount) || 0;
      gstMap[rate].cgst += parseFloat(item.cgst) || 0;
      gstMap[rate].sgst += parseFloat(item.sgst) || 0;
    }

    let html = '';
    for (const [rate, values] of Object.entries(gstMap)) {
      html += `<tr>
        <td>${rate}%</td>
        <td style="text-align:right;">${symbol}${values.taxable.toFixed(2)}</td>
        <td style="text-align:right;">${symbol}${values.cgst.toFixed(2)}</td>
        <td style="text-align:right;">${symbol}${values.sgst.toFixed(2)}</td>
      </tr>`;
    }
    return html;
  }

  /**
   * Helper: Convert number to words (Indian numbering system)
   */
  _numberToWords(num) {
    if (num === 0) return 'Zero';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const numToWords = (n) => {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };

    return numToWords(Math.abs(Math.round(num)));
  }
}

module.exports = new PrintService();
