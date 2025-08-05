import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

function sendMessage(chatId, text) {
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  }).catch(err => console.error("Telegram Send Error:", err));
}

const VALID_CATEGORIES = [
  "FREE FIRE ( ID CODE )",
  "FREE FIRE ( AIRDROP )",
  "FREE FIRE ( WEEKLY & MONTHLY)",
  "FREE FIRE ( LEVEL UP PASS )",
  "FREE FIRE ( UNI PIN )",
  "INDONESIAN SERVER"
];

app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // immediate response

  const message = req.body.message;
  if(!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const [cmd, ...rest] = text.split(" ");
  const param = rest.join(" ");

  try {
    // 1️⃣ Show categories
    if(cmd === "/categories") {
      let msg = "*📂 Available Categories:*\n\n";
      VALID_CATEGORIES.forEach((cat, i) => {
        msg += `${i+1}. ${cat}\n`;
      });
      sendMessage(chatId, msg);
      return;
    }

    // 2️⃣ Show packages of a category: /packages <CategoryName>
    else if(cmd === "/packages") {
      if(!param) {
        sendMessage(chatId, "⚠ Usage: /packages <CategoryName>\nExample: /packages FREE FIRE ( ID CODE )");
        return;
      }
      if(!VALID_CATEGORIES.includes(param)) {
        sendMessage(chatId, "⚠ Invalid category! Use /categories to see valid categories.");
        return;
      }

      const snapshot = await db.ref(`packages/${param}`).once("value");
      if(!snapshot.exists()) {
        sendMessage(chatId, `⚠ No packages found in *${param}*.`);
        return;
      }

      let msg = `*📦 Packages in ${param}:*\n\n`;
      snapshot.forEach(child => {
        const pkg = child.val();
        msg += `ID: \`${child.key}\`\nName: ${pkg.name}\nPrice: ৳${pkg.price}\nStatus: ${pkg.status || "Active"}\n\n`;
      });
      sendMessage(chatId, msg);
      return;
    }

    // 3️⃣ Add package: /addpackage <Category>|<Name>|<Price>
    else if(cmd === "/addpackage") {
      const parts = param.split("|");
      if(parts.length !== 3) {
        sendMessage(chatId, "⚠ Usage: /addpackage Category|Name|Price\nExample: /addpackage FREE FIRE ( ID CODE )|100 Diamonds|100");
        return;
      }
      const [cat, name, priceStr] = parts.map(s => s.trim());
      if(!VALID_CATEGORIES.includes(cat)) {
        sendMessage(chatId, "⚠ Invalid category! Use /categories to see valid categories.");
        return;
      }
      const price = parseFloat(priceStr);
      if(isNaN(price)) {
        sendMessage(chatId, "⚠ Price must be a number.");
        return;
      }

      const newRef = db.ref(`packages/${cat}`).push();
      await newRef.set({
        name,
        price,
        status: "Active",
        createdAt: new Date().toISOString()
      });

      sendMessage(chatId, `✅ Added package to *${cat}*:\n${name} - ৳${price}`);
      return;
    }

    // 4️⃣ Edit package: /editpackage <Category>|<PackageID>|<Name>|<Price>
    else if(cmd === "/editpackage") {
      const parts = param.split("|");
      if(parts.length !== 4) {
        sendMessage(chatId, "⚠ Usage: /editpackage Category|PackageID|Name|Price\nExample: /editpackage FREE FIRE ( ID CODE )|abc123|200 Diamonds|180");
        return;
      }
      const [cat, id, name, priceStr] = parts.map(s => s.trim());
      if(!VALID_CATEGORIES.includes(cat)) {
        sendMessage(chatId, "⚠ Invalid category! Use /categories to see valid categories.");
        return;
      }
      if(!id) {
        sendMessage(chatId, "⚠ PackageID is required.");
        return;
      }
      const price = parseFloat(priceStr);
      if(isNaN(price)) {
        sendMessage(chatId, "⚠ Price must be a number.");
        return;
      }

      const pkgRef = db.ref(`packages/${cat}/${id}`);
      const snapshot = await pkgRef.once("value");
      if(!snapshot.exists()) {
        sendMessage(chatId, "⚠ Package ID not found.");
        return;
      }

      await pkgRef.update({
        name,
        price,
        updatedAt: new Date().toISOString()
      });

      sendMessage(chatId, `✏️ Updated package *${name}* (৳${price}) in *${cat}*`);
      return;
    }

    // 5️⃣ Delete package: /deletepackage <Category>|<PackageID>
    else if(cmd === "/deletepackage") {
      const parts = param.split("|");
      if(parts.length !== 2) {
        sendMessage(chatId, "⚠ Usage: /deletepackage Category|PackageID\nExample: /deletepackage FREE FIRE ( ID CODE )|abc123");
        return;
      }
      const [cat, id] = parts.map(s => s.trim());
      if(!VALID_CATEGORIES.includes(cat)) {
        sendMessage(chatId, "⚠ Invalid category! Use /categories to see valid categories.");
        return;
      }
      if(!id) {
        sendMessage(chatId, "⚠ PackageID is required.");
        return;
      }

      const pkgRef = db.ref(`packages/${cat}/${id}`);
      const snapshot = await pkgRef.once("value");
      if(!snapshot.exists()) {
        sendMessage(chatId, "⚠ Package ID not found.");
        return;
      }

      await pkgRef.remove();
      sendMessage(chatId, `❌ Deleted package ID \`${id}\` from *${cat}*`);
      return;
    }

    // Other commands: fallback help
    else {
      const helpMsg = `🤖 Available Commands:
  /categories
  /packages <CategoryName>
  /addpackage <Category>|<Name>|<Price>
  /editpackage <Category>|<PackageID>|<Name>|<Price>
  /deletepackage <Category>|<PackageID>
  /ping
  /registered
  /orders
  /complete <OrderID>
  /fail <OrderID>`;
      sendMessage(chatId, helpMsg);
    }

  } catch(err) {
    console.error("Command Error:", err);
    sendMessage(chatId, "⚠ Internal error occurred.");
  }
});

// Root test endpoint
app.get("/", (req, res) => {
  res.send("🚀 Telegram Firebase Bot Running Successfully");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
