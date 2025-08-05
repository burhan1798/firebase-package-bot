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
  /editpayment <Method>|<Number>|<Description>
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
  if (!param) return sendMessage(chatId, "⚠ Usage: /packages <CategoryName>");

  const snapshot = await db.ref("packages/"+param).once("value");
  if (!snapshot.exists()) return sendMessage(chatId, `⚠ No packages found in ${param}`);

  let msg = `📦 Packages in ${param}:\n\n`;
  let i = 1;
  snapshot.forEach(child => {
    const pkg = child.val();
    msg += `${i++}️⃣ ${pkg.name} - ৳${pkg.price} (ID: ${child.key})\n`;
  });

  sendMessage(chatId, msg);
} else if (cmd === "/addpackage") {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if(lines.length < 2) {
    return sendMessage(chatId, "⚠ Usage:\n/addpackage <Category>\nName|Price\nName|Price...");
  }

  const category = lines[0].replace("/addpackage","").trim();
  const packages = lines.slice(1);

  let added = 0;
  for (let line of packages) {
    const parts = line.split("|").map(p => p.trim());
    if(parts.length !== 2) continue; // skip invalid
    const [name, price] = parts;

    const newRef = db.ref("packages/"+category).push();
    await newRef.set({ name, price, status: "Active" });
    added++;
  }

  sendMessage(chatId, `✅ Added ${added} packages to ${category}`);
  return;
}
       else if (cmd === "/editpackage") {
  const parts = text.replace("/editpackage","").trim().split("|").map(p=>p.trim());
  if (parts.length !== 4) return sendMessage(chatId, "⚠ Usage: /editpackage <Category>|<PackageID>|<NewName>|<NewPrice>");

  const [category, pkgId, newName, newPrice] = parts;
  await db.ref(`packages/${category}/${pkgId}`).update({
    name: newName,
    price: parseFloat(newPrice)
  });

  sendMessage(chatId, `✅ Package ${pkgId} updated to "${newName} - ৳${newPrice}"`);
} else if (cmd === "/deletepackage") {
  const parts = text.replace("/deletepackage","").trim().split("|").map(p=>p.trim());
  if (parts.length !== 2) return sendMessage(chatId, "⚠ Usage: /deletepackage <Category>|<PackageID>");

  const [category, pkgId] = parts;
  await db.ref(`packages/${category}/${pkgId}`).remove();

  sendMessage(chatId, `🗑 Package ${pkgId} deleted from ${category}`);
}
else if (cmd === "/editpayment") {
  const parts = text.replace("/editpayment","").trim().split("|").map(p=>p.trim());
  if (parts.length < 3) return sendMessage(chatId, 
    "⚠ Usage:\n/editpayment bKash|<NewNumber>|<NewDescription>\n/editpayment Nagad|<NewNumber>|<NewDescription>"
  );

  const [method, number, ...descParts] = parts;
  const description = descParts.join(" ");

  if (method !== "bKash" && method !== "Nagad") {
    return sendMessage(chatId, "⚠ Only 'bKash' or 'Nagad' are allowed.");
  }

  await db.ref("paymentMethods/"+method).set({
    number: number,
    description: description,
    updatedAt: new Date().toLocaleString()
  });

  sendMessage(chatId, `✅ ${method} updated!\nNumber: ${number}\nInstruction: ${description}`);
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