/* ============================================================
   Envío de correo — sin dependencias obligatorias
   ------------------------------------------------------------
   Transportes:
     console  (por defecto) escribe el correo en data/outbox.log
     resend   API HTTPS de Resend      → AL_RESEND_KEY
     brevo    API HTTPS de Brevo       → AL_BREVO_KEY
     smtp     SMTP clásico             → requiere: npm install nodemailer

   Variables comunes:
     AL_MAIL_TRANSPORT=console|resend|brevo|smtp
     AL_MAIL_FROM=no-reply@tudominio.com
     AL_MAIL_NAME=AcordesLibres
   ============================================================ */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const OUTBOX = path.join(DATA_DIR, "outbox.log");

const TRANSPORT = String(process.env.AL_MAIL_TRANSPORT || "console").toLowerCase();
const FROM_EMAIL = String(process.env.AL_MAIL_FROM || "").trim();
const FROM_NAME = String(process.env.AL_MAIL_NAME || "AcordesLibres").trim();

function fromHeader() {
  return FROM_EMAIL ? (FROM_NAME + " <" + FROM_EMAIL + ">") : FROM_NAME;
}

function writeOutbox(text) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(OUTBOX, "\n[" + new Date().toISOString() + "]\n" + text + "\n", "utf8");
  } catch (error) {
    /* si no se puede escribir, al menos queda en consola */
  }
}

async function sendConsole(mail) {
  const text = "Para: " + mail.to + "\nAsunto: " + mail.subject + "\n\n" + mail.text;
  console.log("\n--- CORREO (transporte consola) ---\n" + text + "\n--- fin del correo ---\n");
  writeOutbox(text);
}

async function sendResend(mail) {
  const key = process.env.AL_RESEND_KEY;
  const url = process.env.AL_RESEND_URL || "https://api.resend.com/emails";
  if (!key) throw new Error("Falta AL_RESEND_KEY");
  if (!FROM_EMAIL) throw new Error("Falta AL_MAIL_FROM");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromHeader(),
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error("Resend " + response.status + ": " + detail);
  }
}

async function sendBrevo(mail) {
  const key = process.env.AL_BREVO_KEY;
  if (!key) throw new Error("Falta AL_BREVO_KEY");
  if (!FROM_EMAIL) throw new Error("Falta AL_MAIL_FROM");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error("Brevo " + response.status + ": " + detail);
  }
}

let transporter = null;

async function sendSmtp(mail) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (error) {
    throw new Error("El transporte smtp necesita nodemailer: npm install nodemailer");
  }

  if (!transporter) {
    const port = Number(process.env.AL_SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.AL_SMTP_HOST,
      port,
      secure: process.env.AL_SMTP_SECURE === "1" || port === 465,
      auth: process.env.AL_SMTP_USER
        ? { user: process.env.AL_SMTP_USER, pass: process.env.AL_SMTP_PASS }
        : undefined
    });
  }

  await transporter.sendMail({
    from: fromHeader(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html
  });
}

async function sendMail(mail) {
  if (TRANSPORT === "console") return sendConsole(mail);
  if (TRANSPORT === "resend") return sendResend(mail);
  if (TRANSPORT === "brevo") return sendBrevo(mail);
  if (TRANSPORT === "smtp") return sendSmtp(mail);
  throw new Error("Transporte de correo desconocido: " + TRANSPORT);
}

function mailInfo() {
  return {
    transport: TRANSPORT,
    from: FROM_EMAIL || null,
    outbox: TRANSPORT === "console" ? OUTBOX : null
  };
}

module.exports = { sendMail, mailInfo };
