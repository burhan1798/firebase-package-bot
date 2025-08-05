import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// 🔹 ENV variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

// 🔹 Helper function
function sendMessage(chatId, text) {
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  }).catch(err => console.error("Telegram Send Error:", err));
}

// 🔹 Telegram Webhook
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // ✅ Prevent timeout

  const message = req.body.message;
  if(!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const cmd = text.split(" ")[0];

  try {
    // ---------------- BOT COMMANDS ----------------

    // ✅ Show all packages
    if(cmd === "/packages"){
      const snapshot = await db.ref("packages").once("value");
      if(!snapshot.exists()) return sendMessage(chatId, "⚠ No packages found.");
      
      let msg = "📦 Available Packages:\n\n";
      let i = 1;
      snapshot.forEach(child => {
        const pkg = child.val();
        msg += `${i++}. ${pkg.name} - ৳${pkg.price} (${pkg.status || "Active"})\nID: ${child.key}\n\n`;
      });
      sendMessage(chatId, msg);
    }

    // ✅ Add package (Format: /addpackage Name|Price)
    else if(cmd === "/addpackage"){
      const parts = text.replace("/addpackage ","").split("|");
      const name = parts[0];
      const price = parseFloat(parts[1]);

      if(!name || isNaN(price)) 
        return sendMessage(chatId, "⚠ Format: /addpackage Name|Price");

      const newPkgRef = db.ref("packages").push();
      await newPkgRef.set({
        name: name,
        price: price,
        status: "Active",
        createdAt: new Date().toISOString()
      });

      sendMessage(chatId, `✅ Package Added: ${name} (৳${price})`);
    }

    // ✅ Edit package (Format: /editpackage ID|Name|Price)
    else if(cmd === "/editpackage"){
      const parts = text.replace("/editpackage ","").split("|");
      const id = parts[0], name = parts[1], price = parseFloat(parts[2]);

      if(!id || !name || isNaN(price)) 
        return sendMessage(chatId, "⚠ Format: /editpackage ID|Name|Price");

      await db.ref("packages/"+id).update({
        name: name,
        price: price,
        status: "Active",
        updatedAt: new Date().toISOString()
      });

      sendMessage(chatId, `✅ Package Updated: ${name} (৳${price})`);
    }

    // ✅ Delete package (Format: /deletepackage ID)
    else if(cmd === "/deletepackage"){
      const id = text.split(" ")[1];
      if(!id) return sendMessage(chatId, "⚠ Format: /deletepackage ID");

      await db.ref("packages/"+id).remove();
      sendMessage(chatId, `❌ Package ${id} deleted`);
    }

    // ✅ Unknown Command
    else {
      sendMessage(chatId, "🤖 Available Commands:\n/packages\n/addpackage Name|Price\n/editpackage ID|Name|Price\n/deletepackage ID");
    }

  } catch(err){
    console.error("Bot Command Error:", err);
    sendMessage(chatId, "⚠ Internal Error Occurred");
  }
});

// Root Check
app.get("/", (req,res)=>res.send("🚀 Telegram Bot with Live Package Manager Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Bot server running on port ${PORT}`));
