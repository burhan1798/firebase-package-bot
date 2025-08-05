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
  databaseURL: process.env.FIREBASE_DB_URL,
});
const db = admin.database();

function sendMessage(chatId, text) {
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((err) => console.error("Telegram Send Error:", err));
}

// Categories list (fixed)
const categories = [
  "FREE FIRE ( ID CODE )",
  "FREE FIRE ( AIRDROP )",
  "FREE FIRE ( WEEKLY & MONTHLY)",
  "FREE FIRE ( LEVEL UP PASS )",
  "FREE FIRE ( UNI PIN )",
  "INDONESIAN SERVER",
];

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

// Telegram Webhook
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  res.sendStatus(200); // Respond immediately

  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase();
  const param = parts.slice(1).join(" ");

  try {
    // ======= Old commands =======
    if (cmd === "/ping") {
      sendMessage(chatId, "✅ Bot Alive!");
      return;
    } else if (cmd === "/registered") {
      const snapshot = await db.ref("users").once("value");
      let msg = "👥 Registered Users:\n\n";
      let i = 1;
      snapshot.forEach((child) => {
        const u = child.val();
        msg += `${i++}. ${u.username || "N/A"} | ${u.phone || "N/A"}\n`;
      });
      sendMessage(chatId, msg || "⚠ No users found.");
      return;
    } else if (cmd === "/orders") {
      const snapshot = await db.ref("topupRequests").once("value");
      let msg = "📦 Pending Orders:\n\n";
      let found = false;

      snapshot.forEach((child) => {
        const r = child.val();
        if (r.status && r.status.toLowerCase() === "pending") {
          found = true;
          msg += `Order ID: (${child.key})\nUser: ${r.username}\nPackage: ${r.package}\nAmount: ৳${r.amount}\nMethod: ${r.method}\n-----------------------\n`;
        }
      });

      sendMessage(chatId, found ? msg : "✅ No pending orders right now.");
      return;
    } else if (cmd === "/complete") {
      if (!param) {
        sendMessage(chatId, "⚠ Please provide Order ID");
        return;
      }
      await db.ref("topupRequests/" + param).update({ status: "Completed" });
      sendMessage(chatId, `✅ Order ${param} marked as Completed`);
      return;
    } else if (cmd === "/fail") {
      if (!param) {
        sendMessage(chatId, "⚠ Please provide Order ID");
        return;
      }
      await db.ref("topupRequests/" + param).update({ status: "Failed" });
      sendMessage(chatId, `❌ Order ${param} marked as Failed`);
      return;
    }

    // ======= New commands =======
    else if (cmd === "/categories") {
      let msg = "📂 Categories:\n\n";
      categories.forEach((cat) => {
        msg += `- ${cat}\n`;
      });
      sendMessage(chatId, msg);
      return;
    } else if (cmd === "/packages") {
      if (!param) {
        sendMessage(chatId, "⚠ Please provide Category name\nUse /categories to see all.");
        return;
      }
      if (!categories.includes(param)) {
        sendMessage(chatId, "⚠ Invalid category. Use /categories to see valid categories.");
        return;
      }
      const snapshot = await db.ref("packages/" + param).once("value");
      if (!snapshot.exists()) {
        sendMessage(chatId, "⚠ No packages found in this category.");
        return;
      }
      let msg = `📦 Packages in ${param}:\n\n`;
      snapshot.forEach((child) => {
        const p = child.val();
        msg += `ID: ${child.key}\nName: ${p.name}\nPrice: ৳${p.price}\n----------------\n`;
      });
      sendMessage(chatId, msg);
      return;
    } else if (cmd === "/addpackage") {
  // Get full message text (multi-line)
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  
  if (lines.length < 2) {
    return sendMessage(chatId, "⚠ Usage:\n/addpackage <Category>\nName | Price\nName | Price ...");
  }

  const category = lines[0].replace("/addpackage", "").trim();
  if (!category) {
    return sendMessage(chatId, "⚠ Please provide category after /addpackage");
  }

  let added = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("|").map(p => p.trim());
    if (parts.length === 2) {
      const name = parts[0];
      const price = parseFloat(parts[1]);
      await db.ref("packages/" + category).push({
        name: name,
        price: price,
        status: "Active",
        time: new Date().toLocaleString()
      });
      added++;
    }
  }

  sendMessage(chatId, `✅ ${added} packages added to "${category}"`);
}
       else if (cmd === "/editpackage") {
      if (!param) {
        sendMessage(chatId, "⚠ Please provide details:\n/editpackage <Category>|<PackageID>|<Name>|<Price>");
        return;
      }
      const parts = param.split("|");
      if (parts.length !== 4) {
        sendMessage(chatId, "⚠ Invalid format.\nUse: /editpackage <Category>|<PackageID>|<Name>|<Price>");
        return;
      }
      const [category, packageId, name, priceStr] = parts.map((s) => s.trim());
      if (!categories.includes(category)) {
        sendMessage(chatId, "⚠ Invalid category.");
        return;
      }
      const price = Number(priceStr);
      if (isNaN(price) || price < 0) {
        sendMessage(chatId, "⚠ Invalid price.");
        return;
      }
      const packageRef = db.ref(`packages/${category}/${packageId}`);
      const snap = await packageRef.once("value");
      if (!snap.exists()) {
        sendMessage(chatId, "⚠ Package ID not found.");
        return;
      }
      await packageRef.update({ name, price });
      sendMessage(
        chatId,
        `✅ Edited package ${packageId} in ${category}:\n${name} - ৳${price}`
      );
      return;
    } else if (cmd === "/deletepackage") {
      if (!param) {
        sendMessage(chatId, "⚠ Please provide details:\n/deletepackage <Category>|<PackageID>");
        return;
      }
      const parts = param.split("|");
      if (parts.length !== 2) {
        sendMessage(chatId, "⚠ Invalid format.\nUse: /deletepackage <Category>|<PackageID>");
        return;
      }
      const [category, packageId] = parts.map((s) => s.trim());
      if (!categories.includes(category)) {
        sendMessage(chatId, "⚠ Invalid category.");
        return;
      }
      const packageRef = db.ref(`packages/${category}/${packageId}`);
      const snap = await packageRef.once("value");
      if (!snap.exists()) {
        sendMessage(chatId, "⚠ Package ID not found.");
        return;
      }
      await packageRef.remove();
      sendMessage(chatId, `✅ Deleted package ${packageId} from ${category}`);
      return;
    }

    // Unknown command fallback
    sendMessage(chatId, helpMsg);
  } catch (err) {
    console.error("Command Error:", err);
    sendMessage(chatId, "⚠ Internal error occurred.");
  }
});

app.get("/", (req, res) =>
  res.send("🚀 Telegram Firebase Bot Running Successfully (Non-Blocking)")
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));