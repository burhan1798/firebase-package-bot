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

// 🔹 Helper: Send message to Telegram
function sendMessage(chatId, text) {
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  }).catch(err => console.error("Telegram Send Error:", err));
}

// 🔹 Categories
const categories = [
  "FREE FIRE ( ID CODE )",
  "FREE FIRE ( AIRDROP )",
  "FREE FIRE ( WEEKLY & MONTHLY)",
  "FREE FIRE ( LEVEL UP PASS )",
  "FREE FIRE ( UNI PIN )",
  "INDONESIAN SERVER"
];

// 🔹 Telegram Webhook
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // prevent timeout

  const message = req.body.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const [cmd, ...args] = text.split(" ");
  const argStr = args.join(" ");

  console.log("Received:", cmd, "Args:", argStr);

  try {
    // 1️⃣ Ping
    if (cmd === "/ping") {
      sendMessage(chatId, "✅ Bot Alive!");
    }

    // 2️⃣ Registered Users
    else if (cmd === "/registered") {
      const snapshot = await db.ref("users").once("value");
      let msg = "👥 Registered Users:\n\n";
      let i = 1;
      snapshot.forEach(child => {
        const u = child.val();
        msg += `${i++}. ${u.username || "N/A"} | ${u.phone || "N/A"}\n`;
      });
      sendMessage(chatId, msg || "⚠ No users found.");
    }

    // 3️⃣ Pending Orders
    else if (cmd === "/orders") {
      const snapshot = await db.ref("topupRequests").once("value");
      let msg = "📦 Pending Orders:\n\n";
      let found = false;
      snapshot.forEach(child => {
        const r = child.val();
        if (r.status?.toLowerCase() === "pending") {
          found = true;
          msg += `OrderID: ${child.key}\nUser: ${r.username}\nPackage: ${r.package}\nAmount: ৳${r.amount}\nMethod: ${r.method}\n-----------------------\n`;
        }
      });
      sendMessage(chatId, found ? msg : "✅ No pending orders right now.");
    }

    // 4️⃣ Complete Order
    else if (cmd === "/complete") {
      if (!args[0]) return sendMessage(chatId, "⚠ Please provide Order ID");
      await db.ref("topupRequests/" + args[0]).update({ status: "Completed" });
      sendMessage(chatId, `✅ Order ${args[0]} marked as Completed`);
    }

    // 5️⃣ Fail Order
    else if (cmd === "/fail") {
      if (!args[0]) return sendMessage(chatId, "⚠ Please provide Order ID");
      await db.ref("topupRequests/" + args[0]).update({ status: "Failed" });
      sendMessage(chatId, `❌ Order ${args[0]} marked as Failed`);
    }

    // 6️⃣ Show Categories
    else if (cmd === "/categories") {
      sendMessage(chatId, "📂 Categories:\n" + categories.join("\n"));
    }

    // 7️⃣ Show Packages
    else if (cmd === "/packages") {
      if (!argStr) return sendMessage(chatId, "⚠ Usage: /packages <CategoryName>");
      const snapshot = await db.ref("packages/" + argStr).once("value");
      if (!snapshot.exists()) return sendMessage(chatId, `⚠ No packages found in ${argStr}`);
      let msg = `📦 Packages in ${argStr}:\n\n`;
      snapshot.forEach(child => {
        const p = child.val();
        msg += `${child.key} | ${p.name} - ৳${p.price}\n`;
      });
      sendMessage(chatId, msg);
    }

    // 8️⃣ Add Package
    else if (cmd === "/addpackage") {
  if (!param) return sendMessage(chatId, "⚠ Usage:\n/addpackage <Category>|<Name>|<Price> OR\n/addpackage <Category>\\nName|Price");

  const lines = text.split("\n").slice(1); // skip first line
  let firstLine = text.split("\n")[0].replace("/addpackage", "").trim();

  // Single-line format: Category|Name|Price
  if (lines.length === 0) {
    const parts = firstLine.split("|").map(p => p.trim());
    if (parts.length < 3) return sendMessage(chatId, "⚠ Invalid format. Example:\n/addpackage FREE FIRE ( ID CODE )|25 Diamond|30");

    const category = parts[0];
    const name = parts[1];
    const price = parseInt(parts[2]);

    const newRef = db.ref("packages/" + category).push();
    await newRef.set({ name, price });

    sendMessage(chatId, `✅ Added package to ${category}:\n${name} - ৳${price}`);
    return;
  }

  // Multi-line format: First line = category, next lines = Name|Price
  const category = firstLine;
  let addedCount = 0;
  for (let line of lines) {
    const [name, priceStr] = line.split("|").map(p => p.trim());
    if (!name || !priceStr) continue;

    const price = parseInt(priceStr);
    await db.ref("packages/" + category).push({ name, price });
    addedCount++;
  }

  sendMessage(chatId, `✅ Bulk add completed!\nCategory: ${category}\nAdded: ${addedCount} packages`);
  return;
}

    // 9️⃣ Edit Package
    else if (cmd === "/editpackage") {
      const parts = argStr.split("|");
      if (parts.length < 4) return sendMessage(chatId, "⚠ Usage: /editpackage <Category>|<PackageID>|<Name>|<Price>");
      const [category, packageId, name, priceStr] = parts.map(p => p.trim());
      await db.ref(`packages/${category}/${packageId}`).update({
        name,
        price: parseInt(priceStr)
      });
      sendMessage(chatId, `✏️ Package ${packageId} updated in ${category}`);
    }

    // 🔟 Delete Package
    else if (cmd === "/deletepackage") {
      const parts = argStr.split("|");
      if (parts.length < 2) return sendMessage(chatId, "⚠ Usage: /deletepackage <Category>|<PackageID>");
      const [category, packageId] = parts.map(p => p.trim());
      await db.ref(`packages/${category}/${packageId}`).remove();
      sendMessage(chatId, `🗑 Package ${packageId} deleted from ${category}`);
    }

    // 1️⃣1️⃣ Edit Payment (bKash/Nagad)
    else if (cmd === "/editpayment") {
      const parts = argStr.split("|");
      if (parts.length < 3) return sendMessage(chatId, "⚠ Usage: /editpayment <Method>|<Number>|<Description>");
      const [method, number, description] = parts;
      await db.ref(`paymentMethods/${method}`).set({
        number: number.trim(),
        description: description.trim()
      });
      sendMessage(chatId, `💳 ${method} payment info updated:\nNumber: ${number}\nNote: ${description}`);
    }

    // 🔹 Unknown Command Fallback
    else {
      sendMessage(chatId, `🤖 Available Commands:
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
  /fail <OrderID>`);
    }

  } catch (err) {
    console.error("Command Error:", err);
    sendMessage(chatId, "⚠ Internal error occurred.");
  }
});

// Root Test
app.get("/", (req,res)=>res.send("🚀 Telegram Firebase Bot Running Successfully"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Bot server running on port ${PORT}`));