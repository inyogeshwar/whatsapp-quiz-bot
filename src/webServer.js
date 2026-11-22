import express from 'express';
import path from 'node:path';

export function startWebServer(getSock, port = process.env.PORT || 3000) {
  const app = express();
  app.use(express.json());

  // HTML Dashboard (Flash-MD & Knightbot Style Dark Neon UI)
  app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Bot — Web Pairing Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #25D366;
      --primary-glow: rgba(37, 211, 102, 0.35);
      --bg: #0b0f19;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #128C7E;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Outfit', sans-serif;
    }
    body {
      background: radial-gradient(circle at top, #162032 0%, var(--bg) 70%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 480px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 36px 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px var(--primary-glow);
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(37, 211, 102, 0.12);
      border: 1px solid rgba(37, 211, 102, 0.3);
      color: var(--primary);
      padding: 6px 14px;
      border-radius: 50px;
      font-size: 0.82rem;
      font-weight: 600;
      margin-bottom: 18px;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      background: var(--primary);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--primary);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    h1 {
      font-size: 1.85rem;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 28px;
    }
    .input-group {
      text-align: left;
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    input[type="tel"] {
      width: 100%;
      background: rgba(11, 15, 25, 0.7);
      border: 1.5px solid var(--card-border);
      color: #fff;
      padding: 14px 16px;
      border-radius: 14px;
      font-size: 1.05rem;
      outline: none;
      transition: all 0.25s ease;
      font-family: 'JetBrains Mono', monospace;
    }
    input[type="tel"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 15px var(--primary-glow);
    }
    button.btn-primary {
      width: 100%;
      background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
      color: #0b0f19;
      border: none;
      padding: 15px;
      border-radius: 14px;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 10px 25px rgba(37, 211, 102, 0.3);
    }
    button.btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px rgba(37, 211, 102, 0.45);
    }
    button.btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .code-box {
      display: none;
      margin-top: 24px;
      background: rgba(11, 15, 25, 0.85);
      border: 1.5px dashed var(--primary);
      border-radius: 16px;
      padding: 20px 16px;
      animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .code-label {
      font-size: 0.82rem;
      color: var(--primary);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .code-display {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.2rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: 4px;
      margin-bottom: 14px;
      text-shadow: 0 0 20px var(--primary-glow);
    }
    .copy-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      padding: 9px 18px;
      border-radius: 10px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: var(--primary);
    }
    .instructions {
      margin-top: 26px;
      text-align: left;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 14px;
      padding: 16px 18px;
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .instructions ol {
      padding-left: 20px;
    }
    .instructions li {
      margin-bottom: 6px;
    }
    .status-badge {
      margin-top: 18px;
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .spinner {
      display: none;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(11, 15, 25, 0.3);
      border-top-color: #0b0f19;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="badge">
      <div class="badge-dot"></div>
      <span>WHATSAPP QUIZ MASTER • WEB PAIRING</span>
    </div>

    <h1>Link Your WhatsApp Bot</h1>
    <p class="subtitle">Enter your WhatsApp phone number with country code to get your instant 8-digit Pairing Code.</p>

    <div class="input-group">
      <label for="phoneNumber">WhatsApp Number</label>
      <div class="input-wrapper">
        <input type="tel" id="phoneNumber" placeholder="e.g. 919876543210" autocomplete="off" />
      </div>
    </div>

    <button class="btn-primary" id="getBtn" onclick="requestPairingCode()">
      <div class="spinner" id="spinner"></div>
      <span id="btnText">Get Pairing Code</span>
    </button>

    <div class="code-box" id="codeBox">
      <div class="code-label">Your WhatsApp Pairing Code</div>
      <div class="code-display" id="codeText">---- ----</div>
      <button class="copy-btn" id="copyBtn" onclick="copyCode()">
        <span id="copyIcon">📋</span>
        <span id="copyLabel">Copy Code</span>
      </button>
    </div>

    <div class="instructions">
      <strong style="color: #fff; display: block; margin-bottom: 6px;">📲 How to connect:</strong>
      <ol>
        <li>Open <b>WhatsApp</b> on your mobile phone.</li>
        <li>Go to <b>Settings</b> &gt; <b>Linked Devices</b> &gt; <b>Link a Device</b>.</li>
        <li>Tap <b>"Link with phone number instead"</b> at the bottom.</li>
        <li>Enter the 8-character code generated above!</li>
      </ol>
    </div>

    <div class="status-badge" id="statusBadge">Checking connection status...</div>
  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const badge = document.getElementById('statusBadge');
        if (data.connected) {
          badge.innerHTML = '🟢 Bot is currently <b>ONLINE</b> (' + (data.user || 'Connected') + ')';
          badge.style.color = '#25D366';
        } else {
          badge.innerHTML = '⚪ Bot is waiting for connection...';
        }
      } catch (e) {
        document.getElementById('statusBadge').innerHTML = '⚠️ Server offline';
      }
    }
    checkStatus();
    setInterval(checkStatus, 5000);

    async function requestPairingCode() {
      const input = document.getElementById('phoneNumber');
      const btn = document.getElementById('getBtn');
      const btnText = document.getElementById('btnText');
      const spinner = document.getElementById('spinner');
      const codeBox = document.getElementById('codeBox');
      const codeText = document.getElementById('codeText');

      const phone = input.value.replace(/[^0-9]/g, '');
      if (!phone || phone.length < 9) {
        alert('Please enter a valid phone number with country code (e.g. 919876543210)!');
        return;
      }

      btn.disabled = true;
      spinner.style.display = 'inline-block';
      btnText.innerText = 'Requesting Code...';

      try {
        const res = await fetch('/api/pair?phone=' + phone);
        const data = await res.json();

        if (data.status && data.code) {
          // Format with space (e.g. ABCD-1234 -> ABCD - 1234)
          const formatted = data.code.includes('-') ? data.code.replace('-', ' - ') : (data.code.slice(0, 4) + ' - ' + data.code.slice(4));
          codeText.innerText = formatted;
          codeBox.dataset.raw = data.code;
          codeBox.style.display = 'block';
          btnText.innerText = 'Code Generated!';
        } else {
          alert('Error: ' + (data.error || 'Failed to generate code. Please check server logs.'));
          btnText.innerText = 'Get Pairing Code';
        }
      } catch (err) {
        alert('Failed to connect to server: ' + err.message);
        btnText.innerText = 'Get Pairing Code';
      } finally {
        btn.disabled = false;
        spinner.style.display = 'none';
      }
    }

    function copyCode() {
      const codeBox = document.getElementById('codeBox');
      const rawCode = (codeBox.dataset.raw || document.getElementById('codeText').innerText).replace(/\\s+/g, '').replace('-', '');
      navigator.clipboard.writeText(rawCode).then(() => {
        const copyLabel = document.getElementById('copyLabel');
        const copyIcon = document.getElementById('copyIcon');
        copyLabel.innerText = 'Copied!';
        copyIcon.innerText = '✅';
        setTimeout(() => {
          copyLabel.innerText = 'Copy Code';
          copyIcon.innerText = '📋';
        }, 2000);
      });
    }
  </script>
</body>
</html>`);
  });

  // API Status endpoint
  app.get('/api/status', (req, res) => {
    const sock = getSock();
    const isConnected = Boolean(sock?.user?.id);
    res.json({
      connected: isConnected,
      user: sock?.user?.id || null
    });
  });

  // Health-check endpoint for Render / Koyeb
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  // API Pairing Code endpoint
  app.get('/api/pair', async (req, res) => {
    const phone = (req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone || phone.length < 8) {
      return res.status(400).json({ status: false, error: 'Valid phone number with country code required' });
    }

    const sock = getSock();
    if (!sock) {
      return res.status(503).json({ status: false, error: 'WhatsApp socket not initialized yet. Please wait.' });
    }

    try {
      console.log(`📱 [WEB PAIRING] Requesting Pairing Code for: +${phone}...`);
      const code = await sock.requestPairingCode(phone);
      console.log(`🔑 [WEB PAIRING] Code generated successfully: ${code}`);

      res.json({
        status: true,
        code,
        message: 'Enter this 8-digit code in WhatsApp > Linked Devices > Link with phone number'
      });
    } catch (err) {
      console.error('❌ [WEB PAIRING] Error requesting pairing code:', err.message);
      res.status(500).json({ status: false, error: err.message });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🌐 =================================================`);
    console.log(`🚀 WEB PAIRING DASHBOARD IS LIVE!`);
    console.log(`👉 Open: http://localhost:${port}`);
    console.log(`=================================================\n`);

    // Anti-Sleep: Self-pinging mechanism for Render/Koyeb
    const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    if (externalUrl) {
      const pingUrl = externalUrl.startsWith('http') ? `${externalUrl}/health` : `https://${externalUrl}/health`;
      console.log(`⏰ [ANTI-SLEEP] Active! Self-pinging ${pingUrl} every 10 minutes to prevent Render sleep.`);
      setInterval(async () => {
        try {
          await fetch(pingUrl);
          console.log(`💓 [KEEP-ALIVE] Pinged ${pingUrl} (Render stays 24/7 awake)`);
        } catch (e) {
          // Ignore network blip
        }
      }, 10 * 60 * 1000);
    }
  });

  return app;
}
