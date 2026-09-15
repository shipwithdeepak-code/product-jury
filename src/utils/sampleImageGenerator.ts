// Utility to generate realistic, high-fidelity sample product screenshots using HTML5 Canvas in the browser.

export interface SamplePreset {
  id: string;
  name: string;
  category: string;
  badge: string;
  description: string;
  generateDataUrl: () => string;
}

function drawFlowPilotCanvas(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 1200, 800);

  // Top Nav
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1200, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('FlowPilot', 24, 36);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('/ Workflows / Enterprise Lead Routing v4', 120, 36);

  // Status Badge
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(1000, 18, 90, 24);
  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('DRAFT v4.2', 1012, 34);

  // Subheader / Stepper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 60, 1200, 64);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 123, 1200, 1);

  const steps = [
    { num: '1', title: 'Trigger: Webhook', active: false },
    { num: '2', title: 'Filter: Score > 80', active: false },
    { num: '3', title: 'CRM Schema Mapping', active: true },
    { num: '4', title: 'Slack Notification', active: false },
  ];

  steps.forEach((step, idx) => {
    const x = 40 + idx * 280;
    ctx.fillStyle = step.active ? '#2563eb' : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(x + 12, 92, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = step.active ? '#ffffff' : '#64748b';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(step.num, x + 8, 96);

    ctx.fillStyle = step.active ? '#0f172a' : '#64748b';
    ctx.font = step.active ? 'bold 14px Inter, sans-serif' : '14px Inter, sans-serif';
    ctx.fillText(step.title, x + 34, 96);
  });

  // Left Sidebar: Step Config
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, 148, 700, 580);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 148, 700, 580);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText('Step 3: Map Inbound Fields to Salesforce CRM', 68, 190);

  ctx.fillStyle = '#64748b';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('Match incoming webhook attributes with destination Salesforce Lead properties.', 68, 214);

  // Field Mapping Rows
  const fields = [
    { inbound: 'customer_email', out: 'Salesforce.Lead.Email', required: true },
    { inbound: 'company_domain', out: 'Salesforce.Account.Domain', required: true },
    { inbound: 'est_annual_revenue', out: 'Salesforce.Lead.AnnualRevenue', required: false },
    { inbound: 'tech_stack_tags', out: 'Salesforce.Lead.Technologies__c', required: false },
    { inbound: 'referral_campaign_id', out: 'Salesforce.Campaign.Id', required: false },
  ];

  fields.forEach((f, i) => {
    const y = 260 + i * 64;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(68, y, 280, 42);
    ctx.fillStyle = '#334155';
    ctx.font = '13px monospace';
    ctx.fillText(f.inbound, 84, y + 26);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText('➔', 368, y + 26);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(400, y, 280, 42);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(400, y, 280, 42);
    ctx.fillStyle = '#0f172a';
    ctx.font = '13px monospace';
    ctx.fillText(f.out, 416, y + 26);

    if (f.required) {
      ctx.fillStyle = '#ef4444';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText('* Required', 690, y + 26);
    }
  });

  // Buttons inside card
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(68, 620, 160, 40);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(68, 620, 160, 40);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('+ Add Custom Field', 86, 645);

  ctx.fillStyle = '#2563eb';
  ctx.fillRect(480, 620, 200, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('Validate & Continue ➔', 510, 645);

  // Right Panel: Live Test & Payload Preview
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(764, 148, 396, 580);
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(764, 148, 396, 580);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillText('Dry-Run Payload Inspector', 790, 186);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(790, 210, 344, 430);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '12px monospace';
  const codeLines = [
    '{',
    '  "event": "lead_created",',
    '  "timestamp": 1726054800,',
    '  "source": "landing_page_quote",',
    '  "payload": {',
    '    "email": "sarah@acmecorp.io",',
    '    "domain": "acmecorp.io",',
    '    "arr": 150000,',
    '    "crm_status": "READY_FOR_SYNC"',
    '  }',
    '}',
  ];
  codeLines.forEach((line, idx) => {
    ctx.fillText(line, 810, 240 + idx * 24);
  });

  ctx.fillStyle = '#10b981';
  ctx.fillRect(790, 660, 344, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('⚡ Execute Sample Ingestion Test', 840, 685);

  return canvas.toDataURL('image/png');
}

function drawCheckoutCanvas(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, 1200, 800);

  // Top Nav Header
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, 70);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 69, 1200, 1);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('NorthStar Outfitters', 60, 42);

  ctx.fillStyle = '#6b7280';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText('🔒 Secure 256-Bit SSL Encrypted Checkout', 880, 42);

  // Main 2-column layout
  // Left Column: Checkout Inputs (680px)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(60, 100, 660, 660);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(60, 100, 660, 660);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('1. Contact Information', 90, 140);

  ctx.fillStyle = '#4b5563';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText('Email for order receipt & tracking', 90, 168);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d1d5db';
  ctx.strokeRect(90, 180, 600, 44);
  ctx.fillStyle = '#111827';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('alex.morgan@example.com', 106, 207);

  // Shipping
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('2. Shipping Address', 90, 260);

  // Two inputs row
  ctx.strokeRect(90, 280, 290, 44);
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('First Name: Alex', 106, 307);

  ctx.strokeRect(400, 280, 290, 44);
  ctx.fillText('Last Name: Morgan', 416, 307);

  ctx.strokeRect(90, 340, 600, 44);
  ctx.fillText('Street Address: 428 Market Street, Suite 400', 106, 367);

  // Delivery Method Selection
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('3. Delivery Method', 90, 420);

  // Option 1
  ctx.fillStyle = '#eff6ff';
  ctx.fillRect(90, 440, 600, 48);
  ctx.strokeStyle = '#3b82f6';
  ctx.strokeRect(90, 440, 600, 48);
  ctx.fillStyle = '#1e40af';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('● Express 2-Day Air Shipping (Guaranteed by Thursday)', 110, 470);
  ctx.fillText('$14.99', 620, 470);

  // Option 2
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d1d5db';
  ctx.strokeRect(90, 500, 600, 48);
  ctx.fillStyle = '#374151';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('○ Standard Ground Shipping (3-5 Business Days)', 110, 530);
  ctx.fillText('FREE', 630, 530);

  // Payment section
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('4. Payment Details', 90, 585);

  ctx.strokeRect(90, 605, 600, 44);
  ctx.fillStyle = '#111827';
  ctx.fillText('•••• •••• •••• 4242   Exp: 09/28   CVC: •••', 106, 632);

  ctx.fillStyle = '#6b7280';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('Billing address matches shipping address', 120, 680);

  // Right Column: Order Summary (420px)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(750, 100, 390, 500);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(750, 100, 390, 500);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('Order Summary (3 items)', 776, 140);

  // Items
  const items = [
    { title: 'Trail Master Alpine Shell', color: 'Slate Grey / M', price: '$180.00' },
    { title: 'Merino Thermal Baselayer', color: 'Forest Green / L', price: '$65.00' },
    { title: 'Waterproof Summit Gaiters', color: 'Black / Regular', price: '$35.00' },
  ];

  items.forEach((item, i) => {
    const y = 175 + i * 58;
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(item.title, 776, y);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(item.color, 776, y + 18);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(item.price, 1080, y);
  });

  // Promo Code
  ctx.strokeStyle = '#d1d5db';
  ctx.strokeRect(776, 360, 240, 40);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '13px Inter, sans-serif';
  ctx.fillText('Promo Code: VIP20', 790, 385);

  ctx.fillStyle = '#111827';
  ctx.fillRect(1026, 360, 94, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('Apply', 1056, 385);

  // Totals
  ctx.fillStyle = '#4b5563';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('Subtotal', 776, 430);
  ctx.fillText('$280.00', 1080, 430);

  ctx.fillText('Promo Discount (20%)', 776, 455);
  ctx.fillStyle = '#16a34a';
  ctx.fillText('-$56.00', 1080, 455);

  ctx.fillStyle = '#4b5563';
  ctx.fillText('Estimated Tax', 776, 480);
  ctx.fillText('$17.92', 1085, 480);

  ctx.fillText('Shipping (Express)', 776, 505);
  ctx.fillText('$14.99', 1085, 505);

  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(776, 520, 344, 1);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('Total', 776, 550);
  ctx.fillText('$256.91', 1060, 550);

  // Big CTA Button
  ctx.fillStyle = '#059669';
  ctx.fillRect(750, 620, 390, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillText('Complete Purchase ($256.91)', 820, 655);

  return canvas.toDataURL('image/png');
}

function drawTelemetryCanvas(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Dark background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 1200, 800);

  // Top Nav
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 1200, 60);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText('DataStream Ops', 24, 36);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('| Cluster: prod-kafka-us-east-02 | Region: us-east-1', 180, 36);

  // Warning Banner
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, 60, 1200, 44);
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('⚠️ WARNING: Consumer Lag on Partition #07 exceeded threshold (14.2s). Auto-balancing triggered.', 40, 86);

  // 4 Metric Cards
  const metrics = [
    { title: 'Cluster Throughput', val: '148,200 msg/s', sub: '+12.4% vs median', alert: false },
    { title: 'Consumer Lag (p99)', val: '14,210 ms', sub: 'CRITICAL HIGH', alert: true },
    { title: 'Active Broker Nodes', val: '11 / 12 Online', sub: 'node-09 restarting', alert: true },
    { title: 'Average Disk I/O Wait', val: '3.8%', sub: 'Healthy (Cap 25%)', alert: false },
  ];

  metrics.forEach((m, idx) => {
    const x = 40 + idx * 280;
    ctx.fillStyle = m.alert ? '#1e1b4b' : '#111827';
    ctx.fillRect(x, 124, 260, 120);
    ctx.strokeStyle = m.alert ? '#ef4444' : '#1f2937';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 124, 260, 120);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(m.title, x + 16, 150);

    ctx.fillStyle = m.alert ? '#fca5a5' : '#f8fafc';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(m.val, x + 16, 190);

    ctx.fillStyle = m.alert ? '#f87171' : '#34d399';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(m.sub, x + 16, 222);
  });

  // Table of Ingestion Partitions
  ctx.fillStyle = '#111827';
  ctx.fillRect(40, 264, 1120, 440);
  ctx.strokeStyle = '#1f2937';
  ctx.strokeRect(40, 264, 1120, 440);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillText('Partition Diagnostics & Rebalance Queue', 64, 300);

  // Table Headers
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('PARTITION ID', 64, 340);
  ctx.fillText('LEADER BROKER', 240, 340);
  ctx.fillText('INGESTION RATE', 440, 340);
  ctx.fillText('CURRENT LAG', 640, 340);
  ctx.fillText('HEALTH STATUS', 840, 340);
  ctx.fillText('ACTION', 1020, 340);

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(64, 350, 1072, 1);

  const partitions = [
    { id: 'topic-billing-events-01', broker: 'broker-node-01', rate: '24,200 msg/s', lag: '210 ms', status: 'Healthy', act: 'Inspect' },
    { id: 'topic-billing-events-02', broker: 'broker-node-02', rate: '22,100 msg/s', lag: '190 ms', status: 'Healthy', act: 'Inspect' },
    { id: 'topic-user-telemetry-07', broker: 'broker-node-09 (down)', rate: '41,800 msg/s', lag: '14,210 ms', status: 'UNHEALTHY', act: 'Failover' },
    { id: 'topic-user-telemetry-08', broker: 'broker-node-04', rate: '32,400 msg/s', lag: '310 ms', status: 'Healthy', act: 'Inspect' },
    { id: 'topic-audit-logs-01', broker: 'broker-node-05', rate: '14,900 msg/s', lag: '80 ms', status: 'Healthy', act: 'Inspect' },
  ];

  partitions.forEach((p, i) => {
    const y = 385 + i * 50;
    ctx.fillStyle = p.status === 'UNHEALTHY' ? '#f87171' : '#f8fafc';
    ctx.font = '13px monospace';
    ctx.fillText(p.id, 64, y);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(p.broker, 240, y);
    ctx.fillText(p.rate, 440, y);

    ctx.fillStyle = p.status === 'UNHEALTHY' ? '#ef4444' : '#34d399';
    ctx.fillText(p.lag, 640, y);

    ctx.fillStyle = p.status === 'UNHEALTHY' ? '#ef4444' : '#10b981';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(p.status, 840, y);

    ctx.fillStyle = p.status === 'UNHEALTHY' ? '#dc2626' : '#2563eb';
    ctx.fillRect(1010, y - 16, 80, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText(p.act, 1028, y + 2);
  });

  // Action Bar Footer
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, 720, 1120, 50);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(40, 720, 1120, 50);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText('⚡ Cluster Control Actions:', 64, 750);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(260, 730, 200, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('Force Partition Failover', 290, 750);

  ctx.fillStyle = '#334155';
  ctx.fillRect(480, 730, 180, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('Trigger Safe Rebalance', 506, 750);

  return canvas.toDataURL('image/png');
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'flowpilot',
    name: 'FlowPilot Workflow Canvas (B2B SaaS)',
    category: 'Enterprise Automation Studio',
    badge: 'B2B SaaS',
    description: 'Multi-step CRM field mapping & inbound webhook ingestion sequence with live payload dry-run.',
    generateDataUrl: drawFlowPilotCanvas,
  },
  {
    id: 'checkout',
    name: 'NorthStar Express Checkout (E-Commerce)',
    category: 'Consumer Direct Checkout Flow',
    badge: 'E-Commerce',
    description: 'Multi-step delivery, payment input, promo code validation, and order summary with high-contrast CTA.',
    generateDataUrl: drawCheckoutCanvas,
  },
  {
    id: 'telemetry',
    name: 'DataStream Ops Console (DevOps Telemetry)',
    category: 'Infrastructure & Data Pipeline',
    badge: 'DevOps / Cloud',
    description: 'Distributed Kafka partition diagnostics, consumer lag incident alert, and broker node health monitor.',
    generateDataUrl: drawTelemetryCanvas,
  },
];
