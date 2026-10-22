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
  generateReceiptHtml(order, settings = {}) {
    const s = settings || {};
    const isEnabled = (val, defaultVal = true) => {
      if (val === undefined || val === null || val === '') return defaultVal;
      return val === '1' || val === true || val === 1 || val === 'true';
    };

    const restaurant_name = s.restaurant_name || 'Restaurant';
    const restaurant_address = s.restaurant_address || '';
    const restaurant_phone = s.restaurant_phone || '';
    const restaurant_logo = s.restaurant_logo || '';
    const gstin = s.gstin || '';
    const fssai_no = s.fssai_no || '';
    const footer_text = s.footer_text !== undefined ? s.footer_text : 'Thank you! Visit again!';
    const terms_text = s.terms_text !== undefined ? s.terms_text : 'Goods once sold cannot be returned.';
    const printer_width = s.printer_width || '80';
    const currency_symbol = s.currency_symbol || '₹';
    const receipt_header_title = s.receipt_header_title !== undefined ? s.receipt_header_title : 'TAX INVOICE';

    // Granular Print Controls
    const optShowLogo = isEnabled(s.print_show_logo, true);
    const optShowRestaurantName = isEnabled(s.print_show_restaurant_name, true);
    const optShowAddress = isEnabled(s.print_show_address, true);
    const optShowPhone = isEnabled(s.print_show_phone, true);
    const optShowGstin = isEnabled(s.print_show_gstin, true);
    const optShowFssai = isEnabled(s.print_show_fssai, true);

    const optShowOrderNo = isEnabled(s.print_show_order_no, true);
    const optShowDate = isEnabled(s.print_show_date, true);
    const optShowTable = isEnabled(s.print_show_table, true);
    const optShowOrderType = isEnabled(s.print_show_order_type, true);
    const optShowCashier = isEnabled(s.print_show_cashier, true);
    const optShowCustomer = isEnabled(s.print_show_customer, true);
    const optShowCustomerGstin = isEnabled(s.print_show_customer_gstin, true);

    const optShowRate = isEnabled(s.print_show_rate, true);
    const optShowHsn = isEnabled(s.show_hsn, true);
    const optShowItemTax = isEnabled(s.print_show_item_tax, false);

    const optShowSubtotal = isEnabled(s.print_show_subtotal, true);
    const optShowTaxBreakdown = isEnabled(s.print_show_tax_breakdown, true);
    const optShowPaymentMode = isEnabled(s.print_show_payment_mode, true);
    const optShowNotes = isEnabled(s.print_show_notes, true);
    const optShowAmountWords = isEnabled(s.print_show_amount_words, false);

    const optShowFooter = isEnabled(s.print_show_footer, true);
    const optShowTerms = isEnabled(s.print_show_terms, false);
    const optShowBranding = isEnabled(s.print_show_branding, true);

    const width = printer_width === '58' ? '48mm' : '72mm';
    const fontSize = printer_width === '58' ? '10px' : '12px';

    const formatDate = (dateStr) => {
      const d = new Date(dateStr || Date.now());
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatCurrency = (amount) => {
      const val = parseFloat(amount);
      return `${currency_symbol}${(isNaN(val) ? 0 : val).toFixed(2)}`;
    };

    let itemsHtml = '';
    for (const item of (order.items || [])) {
      const qty = parseFloat(item.quantity || 1);
      const total = parseFloat(item.total || (item.price * qty));
      const hsnLine = (optShowHsn && (item.hsn_code || item.hsn)) ? `<div style="font-size:${printer_width === '58' ? '8px' : '9px'}; color:#444;">HSN: ${item.hsn_code || item.hsn}</div>` : '';
      const taxLine = (optShowItemTax && item.gst_rate) ? `<span style="font-size:9px; color:#444;"> (${item.gst_rate}%)</span>` : '';

      itemsHtml += `
        <tr>
          <td style="text-align:left; padding:2px 0;">${item.name}${taxLine}${hsnLine}</td>
          <td style="text-align:center; padding:2px 0;">${qty}</td>
          ${optShowRate ? `<td style="text-align:right; padding:2px 0;">${formatCurrency(item.price)}</td>` : ''}
          <td style="text-align:right; padding:2px 0;">${formatCurrency(total)}</td>
        </tr>`;
    }

    const hasHeader = (optShowLogo && restaurant_logo) ||
      (optShowRestaurantName && restaurant_name) ||
      (optShowAddress && restaurant_address) ||
      (optShowPhone && restaurant_phone) ||
      (optShowGstin && gstin) ||
      (optShowFssai && fssai_no);

    const infoRows = [];
    if (optShowOrderNo && order.order_no) infoRows.push(`<span>Bill No: ${order.order_no}</span>`);
    if (optShowDate) infoRows.push(`<span>Date: ${formatDate(order.created_at)}</span>`);
    if (optShowTable && order.table_no) infoRows.push(`<span>Table: ${order.table_no}</span>`);
    if (optShowOrderType && order.order_type) infoRows.push(`<span>Type: ${order.order_type.replace('_', ' ').toUpperCase()}</span>`);
    if (optShowCashier && order.user_name) infoRows.push(`<span>Cashier: ${order.user_name}</span>`);
    if (optShowCustomer && (order.customer_name || order.customer_phone)) {
      const cust = `${order.customer_name || ''}${order.customer_phone ? ` (${order.customer_phone})` : ''}`.trim();
      if (cust) infoRows.push(`<span>Customer: ${cust}</span>`);
    }
    if (optShowCustomerGstin && order.customer_gstin) infoRows.push(`<span>Cust GSTIN: ${order.customer_gstin}</span>`);

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
      margin: 0 auto;
      padding: 6px 4px;
      color: #000;
      background: #fff;
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
  ${hasHeader ? `
  <!-- Header -->
  <div class="center">
    ${optShowLogo && restaurant_logo ? `<div style="margin-bottom:6px;"><img src="${restaurant_logo}" alt="Logo" style="max-width:${printer_width === '58' ? '90px' : '130px'}; max-height:60px; object-fit:contain; filter:grayscale(100%);"></div>` : ''}
    ${optShowRestaurantName && restaurant_name ? `<div class="restaurant-name">${restaurant_name}</div>` : ''}
    ${optShowAddress && restaurant_address ? `<div>${restaurant_address}</div>` : ''}
    ${optShowPhone && restaurant_phone ? `<div>Ph: ${restaurant_phone}</div>` : ''}
    ${optShowGstin && gstin ? `<div>GSTIN: ${gstin}</div>` : ''}
    ${optShowFssai && fssai_no ? `<div>FSSAI: ${fssai_no}</div>` : ''}
  </div>
  <div class="double-divider"></div>
  ` : ''}

  <!-- Header Title -->
  ${receipt_header_title && receipt_header_title.trim() ? `
  <div class="center bold">${receipt_header_title.trim()}</div>
  <div class="divider"></div>
  ` : ''}

  <!-- Invoice Info -->
  ${infoRows.length > 0 ? `
    ${infoRows.map(r => `<div class="info-row">${r}</div>`).join('')}
    <div class="divider"></div>
  ` : ''}

  <!-- Items Table -->
  <table>
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align:left; padding:2px 0;">Item</th>
        <th style="text-align:center; padding:2px 0;">Qty</th>
        ${optShowRate ? `<th style="text-align:right; padding:2px 0;">Rate</th>` : ''}
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
    ${optShowSubtotal ? `
    <tr>
      <td>Subtotal</td>
      <td class="right">${formatCurrency(order.subtotal || 0)}</td>
    </tr>` : ''}
    ${parseFloat(order.discount_amount || 0) > 0 ? `
    <tr>
      <td>Discount ${order.discount_type === 'percent' ? `(${order.discount_value}%)` : ''}</td>
      <td class="right">-${formatCurrency(order.discount_amount)}</td>
    </tr>` : ''}
    ${optShowTaxBreakdown ? `
    <tr>
      <td>CGST</td>
      <td class="right">${formatCurrency(order.cgst || order.cgst_total || 0)}</td>
    </tr>
    <tr>
      <td>SGST</td>
      <td class="right">${formatCurrency(order.sgst || order.sgst_total || 0)}</td>
    </tr>` : ''}
    ${parseFloat(order.round_off || 0) !== 0 ? `
    <tr>
      <td>Round Off</td>
      <td class="right">${parseFloat(order.round_off) > 0 ? '+' : ''}${formatCurrency(order.round_off)}</td>
    </tr>` : ''}
  </table>

  <div class="double-divider"></div>

  <table>
    <tr class="total-row">
      <td>GRAND TOTAL</td>
      <td class="right">${formatCurrency(order.total || 0)}</td>
    </tr>
  </table>

  ${optShowAmountWords ? `
  <div style="font-size:${printer_width === '58' ? '8px' : '9px'}; font-style:italic; margin-top:3px; text-align:center;">
    Rupees ${this._numberToWords(Math.round(parseFloat(order.total || 0)))} Only
  </div>` : ''}

  <div class="double-divider"></div>

  <!-- Payment -->
  ${optShowPaymentMode ? `
  <div class="info-row">
    <span>Payment: ${(order.payment_mode || 'cash').toUpperCase()}</span>
  </div>
  ${order.payment_details ? `<div class="info-row"><span>${order.payment_details}</span></div>` : ''}
  ` : ''}

  ${optShowNotes && order.notes ? `
  <div class="info-row" style="font-style:italic;">
    <span>Note: ${order.notes}</span>
  </div>
  ` : ''}

  <!-- GST Summary -->
  ${optShowTaxBreakdown ? `
  <div class="divider"></div>
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
  ` : ''}

  <div class="divider"></div>

  <!-- Footer -->
  <div class="center" style="margin-top:6px;">
    ${optShowFooter && footer_text ? `<div style="font-weight:600;">${footer_text}</div>` : ''}
    ${optShowTerms && terms_text ? `<div style="margin-top:4px; font-size:${printer_width === '58' ? '8px' : '9px'}; color:#444;">${terms_text}</div>` : ''}
    ${optShowBranding ? `<div style="margin-top:6px; font-size:${printer_width === '58' ? '8px' : '9px'}; color:#555;">Made with ❤️ by astrorock</div>` : ''}
  </div>

  <div style="margin-top: 14px;"></div>
</body>
</html>`;
  }

  /**
   * Generate HTML for A4 Tax Invoice
   */
  generateInvoiceHtml(order, settings = {}) {
    const s = settings || {};
    const isEnabled = (val, defaultVal = true) => {
      if (val === undefined || val === null || val === '') return defaultVal;
      return val === '1' || val === true || val === 1 || val === 'true';
    };

    const restaurant_name = s.restaurant_name || 'Restaurant';
    const restaurant_address = s.restaurant_address || '';
    const restaurant_phone = s.restaurant_phone || '';
    const restaurant_email = s.restaurant_email || '';
    const restaurant_logo = s.restaurant_logo || '';
    const gstin = s.gstin || '';
    const fssai_no = s.fssai_no || '';
    const state_name = s.state_name || '';
    const state_code = s.state_code || '';
    const currency_symbol = s.currency_symbol || '₹';
    const footer_text = s.footer_text !== undefined ? s.footer_text : 'Thank you! Visit again!';
    const terms_text = s.terms_text !== undefined ? s.terms_text : 'Goods once sold cannot be returned.';
    const receipt_header_title = s.receipt_header_title !== undefined ? s.receipt_header_title : 'TAX INVOICE';

    const optShowLogo = isEnabled(s.print_show_logo, true);
    const optShowRestaurantName = isEnabled(s.print_show_restaurant_name, true);
    const optShowAddress = isEnabled(s.print_show_address, true);
    const optShowPhone = isEnabled(s.print_show_phone, true);
    const optShowGstin = isEnabled(s.print_show_gstin, true);
    const optShowFssai = isEnabled(s.print_show_fssai, true);

    const optShowTable = isEnabled(s.print_show_table, true);
    const optShowOrderType = isEnabled(s.print_show_order_type, true);
    const optShowCashier = isEnabled(s.print_show_cashier, true);
    const optShowCustomer = isEnabled(s.print_show_customer, true);
    const optShowCustomerGstin = isEnabled(s.print_show_customer_gstin, true);

    const optShowAmountWords = isEnabled(s.print_show_amount_words, true);
    const optShowPaymentMode = isEnabled(s.print_show_payment_mode, true);
    const optShowFooter = isEnabled(s.print_show_footer, true);
    const optShowTerms = isEnabled(s.print_show_terms, false);
    const optShowBranding = isEnabled(s.print_show_branding, true);

    const formatDate = (dateStr) => {
      const d = new Date(dateStr || Date.now());
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount) => {
      const val = parseFloat(amount);
      return `${currency_symbol}${(isNaN(val) ? 0 : val).toFixed(2)}`;
    };

    let itemsHtml = '';
    let sno = 1;
    for (const item of (order.items || [])) {
      const qty = parseFloat(item.quantity || 1);
      const price = parseFloat(item.price || 0);
      const total = parseFloat(item.total || (price * qty));
      const rate = parseFloat(item.gst_rate || 5);
      const taxable = parseFloat(item.taxable_amount || Math.round(((total * 100) / (100 + rate)) * 100) / 100);
      const cgst = parseFloat(item.cgst || Math.round(((total - taxable) / 2) * 100) / 100);
      const sgst = parseFloat(item.sgst || Math.round(((total - taxable) / 2) * 100) / 100);

      itemsHtml += `
        <tr>
          <td>${sno++}</td>
          <td>${item.name}</td>
          <td class="center">${rate}%</td>
          <td class="right">${qty}</td>
          <td class="right">${formatCurrency(price)}</td>
          <td class="right">${formatCurrency(taxable)}</td>
          <td class="right">${formatCurrency(cgst)}</td>
          <td class="right">${formatCurrency(sgst)}</td>
          <td class="right">${formatCurrency(total)}</td>
        </tr>`;
    }

    const totalVal = Math.round(parseFloat(order.total || 0));
    const totalInWords = this._numberToWords(isNaN(totalVal) ? 0 : totalVal);

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
    .footer { margin-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
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
    <div class="header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px;">
      <div style="display:flex; align-items:flex-start; gap:16px;">
        ${optShowLogo && restaurant_logo ? `<img src="${restaurant_logo}" alt="Logo" style="max-height:80px; max-width:140px; object-fit:contain; border-radius:4px;">` : ''}
        <div class="header-left">
          ${optShowRestaurantName ? `<div class="restaurant-name">${restaurant_name}</div>` : ''}
          ${optShowAddress && restaurant_address ? `<p>${restaurant_address}</p>` : ''}
          ${optShowPhone && restaurant_phone ? `<p>Phone: ${restaurant_phone}</p>` : ''}
          ${restaurant_email ? `<p>Email: ${restaurant_email}</p>` : ''}
          ${optShowGstin && gstin ? `<p><strong>GSTIN:</strong> ${gstin}</p>` : ''}
          ${optShowFssai && fssai_no ? `<p><strong>FSSAI:</strong> ${fssai_no}</p>` : ''}
          ${state_name ? `<p><strong>State:</strong> ${state_name} (${state_code})</p>` : ''}
        </div>
      </div>
      <div class="header-right">
        <div style="font-size:11px; color:#666;">Original for Recipient</div>
      </div>
    </div>

    <div class="invoice-title">${receipt_header_title && receipt_header_title.trim() ? receipt_header_title.trim() : 'TAX INVOICE'}</div>

    <!-- Invoice & Customer Info -->
    <div class="info-grid">
      <div class="info-section">
        <h4>Invoice Details</h4>
        <p><strong>Invoice No:</strong> ${order.order_no}</p>
        <p><strong>Date:</strong> ${formatDate(order.created_at)}</p>
        ${optShowTable && order.table_no ? `<p><strong>Table:</strong> ${order.table_no}</p>` : ''}
        ${optShowOrderType ? `<p><strong>Type:</strong> ${(order.order_type || 'dine_in').replace('_', ' ').toUpperCase()}</p>` : ''}
        ${optShowCashier && order.user_name ? `<p><strong>Cashier:</strong> ${order.user_name}</p>` : ''}
      </div>
      <div class="info-section" style="text-align:right;">
        <h4>Customer Details</h4>
        ${optShowCustomer ? `
          <p>${order.customer_name || 'Walk-in Customer'}</p>
          ${order.customer_phone ? `<p>Phone: ${order.customer_phone}</p>` : ''}
        ` : '<p>Walk-in Customer</p>'}
        ${optShowCustomerGstin && order.customer_gstin ? `<p><strong>GSTIN:</strong> ${order.customer_gstin}</p>` : ''}
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
        ${optShowAmountWords ? `
        <strong>Amount in words:</strong><br>
        Rupees ${totalInWords} Only
        ` : ''}
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
    ${optShowPaymentMode ? `
    <div style="margin-top:10px; padding:8px; background:#f9f9f9; border:1px solid #eee;">
      <strong>Payment Mode:</strong> ${(order.payment_mode || 'cash').toUpperCase()}
      ${order.payment_details ? ` | ${order.payment_details}` : ''}
    </div>
    ` : ''}

    ${optShowFooter && footer_text ? `
    <div style="margin-top:10px; text-align:center; font-weight:600; color:#444;">
      ${footer_text}
    </div>
    ` : ''}

    ${optShowTerms && terms_text ? `
    <div style="margin-top:6px; font-size:10px; color:#666;">
      <strong>Terms & Conditions:</strong> ${terms_text}
    </div>
    ` : ''}

    <div class="footer">
      <div class="footer-left">
        <p>This is a computer-generated invoice.</p>
        ${gstin ? '<p>Subject to jurisdiction of local courts.</p>' : ''}
        ${optShowBranding ? '<p style="margin-top:4px; font-size:10px; color:#888;">Made with ❤️ by astrorock</p>' : ''}
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
      const parsedRate = parseFloat(item.gst_rate);
      const rate = !isNaN(parsedRate) ? parsedRate : 5;
      if (!gstMap[rate]) {
        gstMap[rate] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      const qty = parseFloat(item.quantity || 1);
      const total = parseFloat(item.total || ((item.price || 0) * qty));
      const taxable = !isNaN(parseFloat(item.taxable_amount))
        ? parseFloat(item.taxable_amount)
        : Math.round(((total * 100) / (100 + rate)) * 100) / 100;
      const cgst = !isNaN(parseFloat(item.cgst))
        ? parseFloat(item.cgst)
        : Math.round(((total - taxable) / 2) * 100) / 100;
      const sgst = !isNaN(parseFloat(item.sgst))
        ? parseFloat(item.sgst)
        : Math.round(((total - taxable) / 2) * 100) / 100;

      gstMap[rate].taxable += taxable;
      gstMap[rate].cgst += cgst;
      gstMap[rate].sgst += sgst;
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
