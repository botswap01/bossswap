require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const auth = new google.auth.GoogleAuth({
  keyFile: "google-credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// const SPREADSHEET_ID = "17p7CTW26TWTe5zA-ODrg4g4YJ0V4-0X7LhWnoQ2yUjU";
const SPREADSHEET_ID = "1cN9TAVT5KGM3yF_MWMmFUYHrRMadkey9Gtr8FU675bw";
const SHEET_NAME = "เวลาบอสเกิด";

async function readSpawns() {
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!C2:G`, // include column G
  });

  const rows = res.data.values || [];
  return rows
    .map(([boss, , spawn, , percent]) => ({ boss, spawn, percent }))
    .filter((entry) => entry.boss && entry.spawn);
}

function subtractTime(timeStr, mins = 0, hrs = 0) {
  const [h, m, s] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m, s || 0, 0);
  date.setMinutes(date.getMinutes() - mins);
  date.setHours(date.getHours() - hrs);
  return date.toTimeString().slice(0, 5); // "HH:mm"
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  const options = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok", // Timezone +7
  };

  setInterval(async () => {
    const nowTime = new Intl.DateTimeFormat("en-GB", options).format(
      new Date()
    );
    const spawns = await readSpawns();

    spawns.forEach(({ boss, spawn, percent }) => {
      if (!spawn) return;
      const alertTime5min = subtractTime(spawn, 5, 0); // 5 minutes before
      const alertTime1hr = subtractTime(spawn, 0, 1);
      const spawnTime = spawn.slice(0, 5);

      // console.log(`Now: ${nowTime} | 1hr: ${alertTime1hr} | 5min: ${alertTime5min} | Spawn: ${spawnTime}`);

      if (nowTime === alertTime1hr) {
        const msg = `📣 อีก 1 ชั่วโมง **${boss}** จะเกิดเวลา ${spawnTime} | ${
          percent || ""
        } เตรียมตัวให้พร้อม!`;
        if (channel && channel.isTextBased()) channel.send(msg);
      }

      if (nowTime === alertTime5min) {
        const msg = `💡 อีก 5 นาที **${boss}** จะเกิด! ${percent || ""}`;
        if (channel && channel.isTextBased()) channel.send(msg);
      }

      if (nowTime === spawnTime) {
        const msg = `💥 **${boss}** ถึงเวลาออกล่า! @everyone`;
        if (channel && channel.isTextBased()) channel.send(msg);
      }
    });
  }, 60 * 1000);
});

async function updateBossTime(bossName, newTime) {
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

  // อ่านแถวทั้งหมดก่อน
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!C2:G`,
  });

  const rows = res.data.values || [];

  // หา index แถวที่ตรงกับชื่อบอส
  const rowIndex = rows.findIndex(
    ([boss]) => boss && boss.trim() === bossName.trim()
  );

  if (rowIndex === -1) {
    throw new Error(`ไม่พบบอสชื่อ ${bossName}`);
  }

  const updateRange = `${SHEET_NAME}!D${rowIndex + 2}`; // คอลัมน์ E คือเวลาบอสเกิด

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: updateRange,
    valueInputOption: "RAW",
    requestBody: {
      values: [[newTime]],
    },
  });

  return true;
}

async function getRemainingBossesToday() {
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!C2:G`,
  });

  const rows = res.data.values || [];

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const result = rows
  .map(([boss, , spawn, , percent]) => {
    if (!boss || !spawn) return null;
    const [h, m] = spawn.split(":").map(Number);
    const spawnMinutes = h * 60 + m;
    if (spawnMinutes >= nowMinutes) {
      return { boss, spawn, percent, spawnMinutes };
    }
    return null;
  })
  .filter(Boolean)
  .sort((a, b) => a.spawnMinutes - b.spawnMinutes);
  return result;
}

client.on("messageCreate", async (message) => {
  if (message.system || message.author.bot) return;

  const channel = await client.channels.fetch(process.env.CHANNEL_ID);

  // const permissionsList = message.member.permissions.toArray();
  // console.log(permissionsList);
  // console.log(message.member.permissions);
 
 
 
 
 
 

  const content = message.content.trim();

  if (content.startsWith("!อัปเดตบอส")) {
     if (
   !message.member.permissions.has("Administrator") &&
   !message.member.permissions.has("ManageChannels")
 ) {
   return channel.send("❌ คุณไม่มีสิทธิ์อัปเดตเวลาบอส");
 }
 
    const args = message.content.trim().split(" ");
    args.shift(); // ลบคำสั่ง "!อัปเดตบอส"

    const newTime = args[args.length - 1]; // "15:36"
    const bossName = args.slice(0, -1).join(" "); // "ครูม่า"

    if (!bossName || !/^\d{2}:\d{2}$/.test(newTime)) {
      return channel.send(
        "❌ รูปแบบไม่ถูกต้อง! ใช้: `!อัปเดตบอส [ชื่อบอส] [เวลา: HH:MM]`"
      );
    }

    try {
      await updateBossTime(bossName, newTime);
      channel.send(
        `✅ อัปเดตเวลาตายของ **${bossName}** เป็น ${newTime} เรียบร้อยแล้ว`
      );
    } catch (err) {
      channel.send(`❌ ${err.message}`);
    }
  }

  if (content === "!bosslist") {
    const bosses = await getRemainingBossesToday();
    const channel = message.channel;

    if (!channel || !channel.isTextBased()) return;

    if (bosses.length === 0) {
      return channel.send("📅 วันนี้ไม่มีบอสที่เหลือจะเกิดอีก");
    }

    const list = bosses
      .map(
        ({ boss, spawn, percent }) =>
          `🕒 ${spawn} - **${boss}** ${percent || ""}`
      )
      .join("\n");

    channel.send(`📋 **บอสที่เหลือในวันนี้:**\n${list}`);
  }

  if (content === "!nextboss") {
    const bosses = await getRemainingBossesToday();
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return;
    if (bosses.length === 0) {
      return channel.send("📅 วันนี้ไม่มีบอสที่เหลือจะเกิดอีก");
    }
    const list = bosses
      .slice(0, 5)
      .map(
        ({ boss, spawn, percent }) =>
          `🕒 ${spawn} - **${boss}** ${percent || ""}`
      )
      .join("\n");
    channel.send(`📋 **บอสที่เหลือในวันนี้:**\n${list}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
