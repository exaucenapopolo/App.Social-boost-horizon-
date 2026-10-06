import { Router } from "express";

const router: ReturnType<typeof Router> = Router();

router.get("/expo-qr", (_req, res) => {
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN ?? "";
  const expoUrl = expoDomain
    ? `exp://${expoDomain}`
    : null;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Social Boost Horizon — Expo Go</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0A162B;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #111f3a;
      border: 1px solid #1e3a5f;
      border-radius: 20px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 28px; font-weight: 800; color: #6C3AF5; margin-bottom: 8px; }
    .sub { color: #8899aa; font-size: 14px; margin-bottom: 32px; }
    #qrcode {
      display: flex;
      justify-content: center;
      margin-bottom: 24px;
    }
    #qrcode canvas, #qrcode img { border-radius: 12px; }
    .url-box {
      background: #0d1c33;
      border: 1px solid #1e3a5f;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 12px;
      color: #6C3AF5;
      word-break: break-all;
      margin-bottom: 20px;
      font-family: monospace;
    }
    .steps {
      text-align: left;
      background: #0d1c33;
      border-radius: 10px;
      padding: 16px;
      font-size: 13px;
      color: #aabbcc;
      line-height: 1.8;
    }
    .steps strong { color: #fff; }
    .offline {
      color: #ff6b6b;
      font-size: 15px;
      padding: 20px;
    }
    .refresh-btn {
      display: inline-block;
      margin-top: 16px;
      background: #6C3AF5;
      color: #fff;
      padding: 10px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
      border: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Social Boost Horizon</div>
    <div class="sub">Scanner avec Expo Go pour tester l'application</div>

    ${expoUrl ? `
    <div id="qrcode"></div>
    <div class="url-box">${expoUrl}</div>
    <div class="steps">
      <strong>Comment scanner :</strong><br>
      1. Ouvrez <strong>Expo Go</strong> sur votre Android<br>
      2. Appuyez sur <strong>Scan QR Code</strong><br>
      3. Scannez le code ci-dessus<br><br>
      <strong>Ou entrez l'URL manuellement</strong> dans le champ de recherche Expo Go.
    </div>
    <script>
      new QRCode(document.getElementById("qrcode"), {
        text: "${expoUrl}",
        width: 240,
        height: 240,
        colorDark: "#6C3AF5",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    </script>
    ` : `
    <div class="offline">
      ⚠️ Le serveur de développement Expo n'est pas actif.<br>
      Démarrez le workflow "artifacts/mobile: expo" dans Replit.
    </div>
    <a href="javascript:location.reload()" class="refresh-btn">Rafraîchir</a>
    `}
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

export default router;
