# 📖 WhatsApp MCQ Quiz Bot — Complete Features Guide (FEATURES.md)

Is document me WhatsApp Group & Channel MCQ Quiz Bot ke har ek feature ka detailed explanation, architecture, kaam karne ka tareeqa aur commands reference diya gaya hai.

---

## 📑 Index
1. [Interactive Single-Choice WhatsApp Polls](#1-interactive-single-choice-whatsapp-polls)
2. [Real-Time Encrypted Vote Decryption](#2-real-time-encrypted-vote-decryption-anti-cheat)
3. [Speed Bonus & Dynamic Scoring](#3-speed-bonus--scoring-system)
4. [SQLite Leaderboard & Player Tiers](#4-sqlite-leaderboard--player-tiers)
5. [WhatsApp Channel Auto-Poster](#5-whatsapp-channel-newsletter-integration)
6. [In-Chat Question Creator (/addq)](#6-in-chat-question-creator-addq)
7. [Group Mention Engine (/tagall & @all)](#7-group-mention-engine-tagall--all)
8. [Complete Commands Cheat Sheet](#8-complete-commands-cheat-sheet)
9. [Web Pairing Dashboard & 24/7 Cloud Anti-Sleep](#9-web-pairing-dashboard--247-cloud-anti-sleep)
10. [OpenAI-Compatible AI Chatbot & Live AI Quiz Generator](#10-openai-compatible-ai-chatbot--live-ai-quiz-generator)
11. [Free Zero-Key AI Fallback & Custom Persona](#11-free-zero-key-ai-fallback--custom-persona)
12. [Free AI Image Generator (/image)](#12-free-ai-image-generator-image)
13. [Group Auto-Moderation & Bad Words Filter (/warn, /automod)](#13-group-auto-moderation--bad-words-filter)
14. [Reactions, Animated GIFs & Latency Benchmark (/ping)](#14-reactions-animated-gifs--latency-benchmark)

---

## 1. Interactive Single-Choice WhatsApp Polls

### Kaise Kaam Karta Hai?
Bot WhatsApp ke native **Single-Choice Polls** (`selectableCount: 1`) ka use karta hai:
- Bot group me question aur 4 options ke sath poll bhejta hai.
- Members ko chat me kuch type nahi karna padta, sirf poll ke option par 1-tap karna hota hai.
- Group chat ekdum clean rehti hai (50 log answer karenge tab bhi chat me spam nahi hoga).

### Text Fallback Support:
Agar kisi member ke phone me poll tap nahi ho raha, toh bot **Text Reply** bhi accept karta hai:
- User chat me `1`, `2`, `3`, `4` ya `A`, `B`, `C`, `D` reply karke bhi answer de sakta hai.

---

## 2. Real-Time Encrypted Vote Decryption (Anti-Cheat)

### Technical Workflow:
WhatsApp me poll votes encrypted format me transfer hote hain:
1. Jab koi member option par tap karta hai, WhatsApp ek encrypted packet (`pollUpdateMessage`) bhejta hai.
2. Bot is packet ko `messages.upsert` me real-time intercept karta hai.
3. Bot original poll ke `messageSecret` aur voter ke JID se **AES-256-GCM** decryption run karta hai.
4. Decrypted vote me se **SHA-256 hash** nikaal kar options ke sath match kiya jata hai.

### Anti-Cheat Protection:
- **Sirf Pehla Vote Count Hota Hai:** Agar koi user apna option change karta hai ya baar-baar vote karta hai, toh bot sirf uske pehle vote aur uske exact timestamp (milliseconds) ko record karta hai.

---

## 3. Speed Bonus & Scoring System

Quiz me sabse pehle answer dene ka alag thrill hota hai:

| Result | Points | Explanation |
|---|---|---|
| ⚡ **Fastest Correct** | **+10 Points** | Sabse pehle sahi answer dene wale winner ko extra bonus. |
| ✅ **Other Correct** | **+6 Points** | Baaki sabhi log jinhone time limit ke andar sahi answer diya. |
| ❌ **Wrong Answer** | **0 Points** | Galat option select karne par koi point nahi milega. |

### Round Result Announcement:
25 seconds ka timer khatam hote hi bot automatically summary bhejta hai:
- Correct answer reveal
- Fastest player ka mention aur time (e.g., `⚡ Fastest: @919876543210 in 2.8s (+10 pts)`)
- Baaki sahi answers ka list
- 5 second delay ke baad agla question automatically start hota hai.

---

## 4. SQLite Leaderboard & Player Tiers

Sabhi scores permanent **SQLite Database** (`data/quiz.db`) me save hote hain. Computer band hone ya bot restart hone par bhi points kabhi delete nahi hote.

### 🎖️ Player Tiers & Badges:
Total points ke hisab se players ko rank badges milte hain jo Leaderboard aur Profile me chamakte hain:
- 🥉 **Rookie Quizzer** (0 – 49 points)
- 🥈 **Knowledge Seeker** (50 – 149 points)
- 🥇 **Trivia Master** (150 – 299 points)
- 👑 **Grandmaster** (300+ points)

### Commands:
- `/top` ya `/leaderboard` — Group ke Top 10 players unke medals (🥇, 🥈, 🥉), points aur tier ke sath.
- `/rank` ya `/score` — Player ka personal card (Rank, Tier, Total Points, Correct Count, Accuracy %).

---

## 5. WhatsApp Channel (Newsletter) Integration

Bot aapke official WhatsApp Channel ke sath directly sync ho jata hai:

### Features:
1. **Link Channel:** `/channel set <channel_link>`
   - Example: `/channel set https://whatsapp.com/channel/0029VaXXXX`
   - Bot invite code se Channel ka internal Newsletter JID automatically resolve kar leta hai.
2. **Instant Post:** `/channel post`
   - Database me se ek random MCQ question nikaal kar turant channel par post kar deta hai.
3. **Auto-Pilot Schedule:** `/channel auto 60`
   - Har 60 minutes me bot bina kisi manual intervention ke channel me naye-naye questions post karta rahega.
   - Bot restart hone par bhi ye schedule auto-resume ho jata hai!
4. **Group Cross-Promotion:** `/channel grouplink <group_invite_link>`
   - Channel post ke niche aapke discussion group ka link promote karta hai taaki channel ke followers group me aakar live quiz khele!

---

## 6. In-Chat Question Creator (/addq)

Aapko kisi JSON file ya code ko edit karne ki zaroorat nahi hai. Admin chat me hi naye questions add kar sakta hai:

### Syntax:
```text
/addq Question text? | Opt1, Opt2, Opt3, Opt4 | CorrectOptionNumber(1-4) | [Category]
```

### Example:
```text
/addq Bharat ki pehli mahila rashtrapati kaun thi? | Pratibha Patil, Indira Gandhi, Droupadi Murmu, Sarojini Naidu | 1 | History
```

👉 Ye question turant `data/questions.json` me append ho jayega aur active quiz rounds me randomly aana shuru ho jayega!

---

## 7. Group Mention Engine (/tagall & @all)

### Features:
- WhatsApp ka official `@all` 32 se zyada members wale group me sirf Admins ke liye hota hai, lekin bot ka `/tagall` **bina kisi restriction ke sabhi members ko mention** kar sakta hai.
- **Syntax:** `/tagall [optional message]`
- **Quiz me use:** `/quiz 10 @all` likhne par quiz round shuru hote hi sabhi members ko tag karke alert bhej diya jata hai taaki sab active ho sakein.

---

## 8. Complete Commands Cheat Sheet

| Command | Usage | Example |
|---|---|---|
| **/quiz** | Default 5 questions ka quiz shuru karein | `/quiz` |
| **/quiz [count]** | Manchahe questions ka quiz shuru karein | `/quiz 50` |
| **/quiz all** | Poore 200+ questions ka marathon round | `/quiz all` |
| **/quiz [count] @all** | Sabhi members ko tag karke quiz start karein | `/quiz 10 @all` |
| **/stop** / **/stopquiz**| Active quiz ko turant rokein (points safe rahenge) | `/stop` |
| **/top** / **/leaderboard** | Group ke Top 10 players leaderboard | `/leaderboard` |
| **/rank** / **/score** | Apna score, rank, tier aur accuracy % dekhein | `/rank` |
| **/tagall [msg]** | Group ke sabhi members ko mention karein | `/tagall Sabhi log active ho jao!` |
| **/channel set [link]** | Apna WhatsApp Channel connect karein | `/channel set https://whatsapp.com/channel/...` |
| **/channel post** | Channel me turant ek question post karein | `/channel post` |
| **/channel auto [min]**| Channel me recurring auto-post chalu karein | `/channel auto 60` |
| **/channel stop** | Channel auto-posting band karein | `/channel stop` |
| **/channel grouplink [link]** | Channel post ke sath group link promote karein | `/channel grouplink https://chat.whatsapp.com/...` |
| **/addq** | Chat se hi naya question database me dalein | `/addq Q? \| O1, O2, O3, O4 \| 1 \| GK` |
| **/categories** | Available chapters aur total questions dekhein | `/categories` |
| **/ai [prompt]** | AI Chatbot se koi bhi sawaal poochhein | `/ai What is black hole?` |
| **/aiquiz [topic] [n]**| AI se live fresh MCQs banwake quiz start karein | `/aiquiz Cricket 5` |
| **/image [prompt]** | Free me high-res AI image generate karein | `/image neon cyberpunk cat 4k` |
| **/aisettings** | AI API Key, Base URL, Model aur Prompt configure karein | `/aisettings` |
| **/ping** / **/speed** | Bot ka latency ping, uptime aur RAM usage check karein | `/ping` |
| **/react [emoji]** | Kisi message par emoji reaction dein | `/react ❤️` |
| **/gif [caption]** | High-energy celebration animated GIF bhejein | `/gif Winner! 🎉` |
| **/automod on/off** | Abusive words auto-warning enable/disable karein | `/automod on` |
| **/warn @user [reason]**| User ko warning issue karein (3 warnings limit) | `/warn @user abusive words` |
| **/resetwarn @user** | User ki warnings 0 karein | `/resetwarn @user` |
| **/warnings** | User ki active warnings count dekhein | `/warnings` |
| **/help** | Sabhi commands ka quick menu dekhein | `/help` |

---

## 9. Web Pairing Dashboard & 24/7 Cloud Anti-Sleep

### Web Dashboard Overview:
Bot ke sath ek built-in Express Web Dashboard chalta hai:
- **URL:** `http://localhost:3000` (ya Render par hosted URL).
- **Features:**
  1. **Dark Neon Web UI:** Mobile aur Desktop dono par responsive clean design.
  2. **Phone Number Input:** Country code ke sath phone number dalein (e.g., `919876543210`).
  3. **Instant 8-Digit Pairing Code:** Live WhatsApp pairing code generate karta hai with 1-click **Copy Code** button.
  4. **Live Status Indicator & Privacy Shield:** Jab bot online connect ho jata hai toh dashboard secure lock ho jata hai aur phone number public view se hide rehta hai.

### 24/7 Render Cloud Anti-Sleep (Cron-Job Setup):
Render free tier 15 minute ke baad sleep ho jata hai. Isko 24/7 active rakhne ke do tareeqe hain:
1. **Built-in Self-Ping:** Bot khud har 10 minute me apne `/health` endpoint ko ping karta hai.
2. **Cron-job.org:** [cron-job.org](https://cron-job.org) par `https://your-app.onrender.com/health` ko har 10 minute schedule karein. Bot kabhi sleep nahi hoga!

---

## 10. OpenAI-Compatible AI Chatbot & Live AI Quiz Generator

Bot me kisi bhi **OpenAI-Compatible AI Provider** ko connect kiya ja sakta hai (OpenAI, OpenRouter, Groq, DeepSeek, Together AI, Ollama, etc.).

### 1. AI Se Chat Karna:
- **Command:** `/ai <question>` ya `/gpt <question>`
- **Example:** `/ai Photo editing ke liye best software kaunsa hai?`
- Bot group me AI ka clean formatted answer post karega with instant `⏳` and `✅` reactions.

### 2. Live AI Quiz Generator (/aiquiz):
Agar aapko database ke bahar kisi naye topic par quiz chalana hai, toh AI turant naye MCQs banayega:
- **Command:** `/aiquiz [topic] [count]`
- **Examples:**
  - `/aiquiz Indian History 5`
  - `/aiquiz Cricket World Cup 3`
  - `/aiquiz Python Programming 4`
👉 AI turant 4 options aur correct answer ke sath fresh MCQs generate karega aur group me **Single-Choice Poll round live start** kar dega!

### 3. AI Settings Configuration (/aisettings):
Admin WhatsApp chat se hi settings badal sakta hai:
- `/aisettings setkey <your_api_key>` — API Key set karein.
- `/aisettings seturl <base_url>` — Provider badlein (jaise Groq: `https://api.groq.com/openai/v1`).
- `/aisettings setmodel <model_name>` — Model name badlein (jaise `llama-3.3-70b-versatile`, `gpt-4o-mini`).
- `/aisettings setprompt <instruction>` — Custom persona ya instructions set karein.
- `/aisettings resetprompt` — Default persona par reset karein.

---

## 11. Free Zero-Key AI Fallback & Custom Persona

Agar aapke paas koi paid API key nahi hai ya aap Groq/OpenAI setup nahi karna chahte, toh bot me **Free Zero-Key AI Engine** integrated hai:
- **Automatic Fallback:** Jab koi API key set nahi hoti, bot automatically bina kisi key ke **Pollinations AI / FreeLLMAPI** se answers fetch karta hai.
- **Custom System Instructions:** `/aisettings setprompt You are a polite educational assistant.` se bot ke AI persona ko apne group ke hisab se tailor kar sakte hain.

---

## 12. Free AI Image Generator (/image)

Text prompt likh kar high-quality AI images generate karein:
- **Command:** `/image <prompt>` ya `/imagine <prompt>`
- **Example:** `/image a cute astronaut dog on mars 4k realistic`
- Bot processing ke waqt `🎨` reaction dega aur WhatsApp par direct high-res image reply karega!

---

## 13. Group Auto-Moderation & Bad Words Filter

WhatsApp groups me shanti aur decorum maintain karne ke liye advanced moderation engine:
- **Auto-Filter:** Hindi aur English abusive slurs par bot automatically message delete/warn karta hai.
- **Warning System (Max 3):** User ko `⚠️ [1/3] Warning` issue hoti hai. 3 warnings cross karne par group admins ko action lene ka alert milta hai.
- **Commands:**
  - `/automod on` ya `/automod off` — Auto-moderation toggle karein.
  - `/warn @user [reason]` — Admin dwara kisi member ko manual warning dena.
  - `/resetwarn @user` — Warnings reset karna.
  - `/warnings` — Member ki current warnings count check karna.

---

## 14. Reactions, Animated GIFs & Latency Benchmark (/ping)

- **Emoji Reactions:** `/react <emoji>` se kisi bhi message par WhatsApp emoji reaction lagayein (e.g. `/react 🔥`).
- **Celebration GIFs:** `/gif <caption?>` se high-energy animated celebration video GIFs share karein (`gifPlayback: true`).
- **Ping & Performance:** `/ping` command se bot ka live response latency (ms), uptime aur RAM usage monitor karein.
